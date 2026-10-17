// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '30');

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ snapshots: [] });

    const snapshots = await (prisma as any).cMVSnapshot.findMany({
      where: { restaurantId },
      orderBy: { periodEnd: 'desc' },
      take: limit,
    });

    // Sort asc for charting
    const sorted = snapshots.slice().reverse();

    const latest = snapshots[0] || null;

    return NextResponse.json({
      snapshots: sorted,
      latest,
      count: snapshots.length,
    });
  } catch (error: any) {
    console.error('CMV history error:', error);
    return NextResponse.json({ error: 'Erro ao buscar histórico CMV' }, { status: 500 });
  }
}
