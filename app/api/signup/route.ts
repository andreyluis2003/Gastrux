// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import { trialEnd } from '@/lib/billing/plan-access';
import { sendWelcomeIfDue } from '@/lib/onboarding/emails';
import { attachReferral, findReferrer } from '@/lib/referrals/signup';
import { REFERRAL_TRIAL_BONUS_DAYS } from '@/lib/referrals/rules';
import { REFERRAL_COOKIE } from '@/lib/referrals/code';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, name, acceptedTerms } = body;
    // Stored in lower case, so the login finds it however the person types it
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Usuário já existe' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    // Plans of 2026-10-18: 30 days of Business, no card (lib/billing/plan-access.ts). A referral link or code
    // (plan 2026-10-24 indicacao) adds 15: the code typed in the form wins over the one the link left in the cookie.
    const typedCode = typeof body.referralCode === 'string' && body.referralCode.trim() ? body.referralCode : null;
    const referrer = await findReferrer(typedCode ?? req.cookies?.get?.(REFERRAL_COOKIE)?.value);
    const ends = referrer ? new Date(trialEnd().getTime() + REFERRAL_TRIAL_BONUS_DAYS * 86_400_000) : trialEnd();

    // Create user as OWNER with auto-provisioned restaurant
    const restaurantName = name ? `Restaurante ${name}` : 'Meu Restaurante';

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
        role: 'OWNER',
        subscriptionTier: 'business',
        subscriptionStatus: 'trialing',
        trialEndsAt: ends,
        acceptedTermsAt: acceptedTerms ? new Date() : null,
      },
    });

    // Auto-provision restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName,
        email: email,
        ownerId: user.id,
        status: 'TRIAL',
        subscriptionTier: 'business',
        subscriptionStatus: 'trialing',
        trialEndsAt: ends,
      },
    });

    // Link user to restaurant
    await prisma.restaurantUser.create({
      data: {
        restaurantId: restaurant.id,
        userId: user.id,
        role: 'OWNER',
        permissions: ['ALL'],
        acceptedAt: new Date(),
      },
    });

    // Set current restaurant
    await prisma.user.update({
      where: { id: user.id },
      data: { currentRestaurantId: restaurant.id },
    });

    if (referrer) await attachReferral(restaurant.id, referrer);

    // Seed default categories for the new restaurant
    const defaultCategories = ['Carnes', 'Vegetais', 'Laticínios', 'Temperos', 'Bebidas', 'Outros'];
    const categoryMap: Record<string, string> = {};
    await Promise.all(
      defaultCategories.map(async (catName) => {
        try {
          const cat = await prisma.ingredientCategory.create({
            data: { name: catName, restaurantId: restaurant.id },
          });
          categoryMap[catName] = cat.id;
        } catch {
          // ignore if duplicates
        }
      })
    );

    // The example menu is no longer the same for everyone: the sign-up questions that come next
    // (/auth/qualification) put the one of the chosen business type ("Comece com",
    // lib/onboarding/seed-template.ts), or none when the owner starts blank.

    // Welcome e-mail (Resend, lib/onboarding/emails.ts); without waiting: the daily run sends it if this one fails
    sendWelcomeIfDue(user.id).catch((err) => console.error('Failed to send welcome email:', err));

    return NextResponse.json(
      {
        message: 'Conta criada com sucesso! Seu restaurante já está pronto.',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
        },
        trial: {
          daysRemaining: 30,
          tier: 'starter',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar usuário' },
      { status: 500 }
    );
  }
}

