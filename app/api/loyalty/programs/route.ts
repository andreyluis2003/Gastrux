// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { getOrCreateLoyaltyProgram } from '@/lib/loyalty/get-program';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json([]);

    // Garante que a loja tenha o seu programa (isolamento multi-tenant)
    await getOrCreateLoyaltyProgram(restaurantId);

    const programs = await prisma.loyaltyProgram.findMany({
      where: { restaurantId },
      include: {
        rewards: {
          where: { active: true },
        },
        _count: {
          select: { customerAccounts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(programs);
  } catch (error) {
    console.error('Error fetching loyalty programs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch loyalty programs' },
      { status: 500 }
    );
  }
}
