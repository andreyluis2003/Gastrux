import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { analyzeMenu } from '@/lib/menu-engineering/analyze';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  try {
    const { searchParams } = new URL(req.url);
    const period = parseInt(searchParams.get('period') || '30');
    // The restaurant of the membership: with no restaurant the analysis read every restaurant's fichas
    return NextResponse.json(await analyzeMenu(gate.member.restaurantId, period));
  } catch (error) {
    console.error('Menu Engineering error:', error);
    return NextResponse.json({ error: 'Erro na engenharia de cardápio' }, { status: 500 });
  }
}
