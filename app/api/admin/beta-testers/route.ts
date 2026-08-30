// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session || !['ADMIN'].includes(session.user?.role as string)) return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const where: any = {};
  if (status) where.status = status;

  const testers = await prisma.betaTester.findMany({
    where,
    include: { interactions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: { updatedAt: 'desc' },
  });

  // Hydrate with linked user info (active flag) for block/unblock UI
  const userIds = testers.map((t: any) => t.userId).filter(Boolean);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, active: true, email: true, name: true, trialEndsAt: true },
      })
    : [];
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  return NextResponse.json(
    testers.map((t: any) => ({
      ...t,
      linkedUser: t.userId ? byId[t.userId] || null : null,
    })),
  );
}

export async function POST(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      name,
      email,
      phone,
      restaurantName,
      restaurantCity,
      restaurantState,
      existingUserId, // optional: attach to existing User
      createAccess = true, // create login + 30 day access by default
      password, // optional: admin-defined password
    } = body;

    if (!name || !email || !restaurantName || !restaurantCity || !restaurantState) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    // Prevent duplicates
    const exists = await prisma.betaTester.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: 'Já existe um beta tester com esse email' }, { status: 400 });

    let userId: string | null = null;
    let tempPassword: string | null = null;
    const accessEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (createAccess) {
      // Attach to existing or create new user
      if (existingUserId) {
        const u = await prisma.user.findUnique({ where: { id: existingUserId } });
        if (!u) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        // Ensure no other beta tester is already linked to this user
        const alreadyLinked = await prisma.betaTester.findFirst({ where: { userId: existingUserId } });
        if (alreadyLinked) return NextResponse.json({ error: 'Este usuário já possui um acesso beta vinculado' }, { status: 400 });
        userId = u.id;
        // Extend trial / activate
        await prisma.user.update({
          where: { id: u.id },
          data: {
            active: true,
            trialEndsAt: accessEndsAt,
            subscriptionStatus: 'trialing',
          },
        });
      } else {
        const existingByEmail = await prisma.user.findUnique({ where: { email } });
        if (existingByEmail) {
          userId = existingByEmail.id;
          if (password) {
            tempPassword = password;
            await prisma.user.update({
              where: { id: existingByEmail.id },
              data: {
                password: await bcryptjs.hash(password, 10),
                active: true,
                trialEndsAt: accessEndsAt,
                subscriptionStatus: 'trialing',
              },
            });
          } else {
            await prisma.user.update({
              where: { id: existingByEmail.id },
              data: { active: true, trialEndsAt: accessEndsAt, subscriptionStatus: 'trialing' },
            });
          }
        } else {
          tempPassword = password || randomBytes(6).toString('hex');
          const hashed = await bcryptjs.hash(tempPassword, 10);
          const newUser = await prisma.user.create({
            data: {
              email,
              password: hashed,
              name,
              role: 'OWNER',
              active: true,
              subscriptionTier: 'starter',
              subscriptionStatus: 'trialing',
              trialEndsAt: accessEndsAt,
            },
          });
          userId = newUser.id;

          // Auto-provision restaurant
          const restaurant = await prisma.restaurant.create({
            data: {
              name: restaurantName,
              email,
              ownerId: newUser.id,
              status: 'TRIAL',
              subscriptionTier: 'starter',
              subscriptionStatus: 'trialing',
              trialEndsAt: accessEndsAt,
            },
          });
          await prisma.restaurantUser.create({
            data: {
              restaurantId: restaurant.id,
              userId: newUser.id,
              role: 'OWNER',
              permissions: ['ALL'],
              acceptedAt: new Date(),
            },
          });
          await prisma.user.update({
            where: { id: newUser.id },
            data: { currentRestaurantId: restaurant.id },
          });
          // Default categories
          const defaults = ['Carnes', 'Vegetais', 'Laticínios', 'Temperos', 'Bebidas', 'Outros'];
          for (const cat of defaults) {
            try {
              await prisma.ingredientCategory.create({
                data: { name: cat, restaurantId: restaurant.id },
              });
            } catch {}
          }
        }
      }
    }

    const tester = await prisma.betaTester.create({
      data: {
        name,
        email,
        phone,
        restaurantName,
        restaurantCity,
        restaurantState,
        status: createAccess ? 'active' : 'prospect',
        accessGrantedAt: createAccess ? new Date() : null,
        accessEndsAt: createAccess ? accessEndsAt : null,
        userId,
      },
    });

    return NextResponse.json({ ...tester, tempPassword }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating beta tester:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao criar beta tester' }, { status: 500 });
  }
}
