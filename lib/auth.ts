// @ts-nocheck
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';
import bcryptjs from 'bcryptjs';

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'jsmith@example.com' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email e senha são obrigatórios');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error('Usuário não encontrado ou sem senha configurada');
        }

        const isPasswordValid = await bcryptjs.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error('Senha inválida');
        }

        if (!user.active) {
          throw new Error('Usuário inativo');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'placeholder-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-client-secret',
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.role = (user as any).role || 'OWNER';
        token.id = user.id;
      }
      // For Google SSO users, ensure role is always set
      if (!token.role) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email as string },
            select: { role: true, id: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            if (!token.id) token.id = dbUser.id;
          }
        } catch (e) {
          console.error('[JWT Callback] Error fetching user role:', e);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard or home page
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl + '/dashboard';
    },
  },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  events: {
    async signIn({ user }) {
      // Update lastSignInAt on every login (credentials + Google SSO)
      try {
        if (user?.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastSignInAt: new Date() },
          });
        }
      } catch (error) {
        console.error('[Auth Event] Error updating lastSignInAt:', error);
      }
    },
    async createUser({ user }) {
      // When a user is created via Google SSO (adapter), set them as OWNER and create their restaurant
      try {
        console.log('[Auth Event] New user created via adapter (Google SSO):', user.email);
        
        // Update user role to OWNER
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'OWNER', subscriptionTier: 'starter', subscriptionStatus: 'active' },
        });

        // Create default restaurant
        const restaurant = await prisma.restaurant.create({
          data: {
            name: user.name ? `Restaurante de ${user.name}` : 'Meu Restaurante',
            ownerId: user.id,
            status: 'ACTIVE',
            subscriptionStatus: 'active',
          },
        });

        // Link user to restaurant
        await prisma.restaurantUser.create({
          data: {
            userId: user.id,
            restaurantId: restaurant.id,
            role: 'OWNER',
          },
        });

        // Set current restaurant
        await prisma.user.update({
          where: { id: user.id },
          data: { currentRestaurantId: restaurant.id },
        });

        // Create default ingredient categories
        const defaultCategories = [
          'Carnes', 'Aves', 'Peixes e Frutos do Mar', 'Vegetais e Legumes',
          'Frutas', 'Laticínios', 'Grãos e Cereais', 'Temperos e Condimentos',
          'Óleos e Gorduras', 'Bebidas', 'Descartáveis', 'Outros',
        ];
        for (const name of defaultCategories) {
          await prisma.ingredientCategory.create({
            data: { name, restaurantId: restaurant.id },
          }).catch(() => {}); // ignore duplicates
        }

        console.log('[Auth Event] Restaurant created for Google SSO user:', restaurant.id);
      } catch (error) {
        console.error('[Auth Event] Error setting up Google SSO user:', error);
      }
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
