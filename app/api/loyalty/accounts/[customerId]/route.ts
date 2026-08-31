// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: params.customerId, restaurantId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const accounts = await prisma.customerLoyaltyAccount.findMany({
      where: { customerId: params.customerId, program: { restaurantId } },
      include: {
        program: {
          include: {
            rewards: {
              where: { active: true },
            },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Error fetching loyalty accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch loyalty accounts' },
      { status: 500 }
    );
  }
}
