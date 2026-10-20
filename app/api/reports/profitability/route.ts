import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { profitabilityInRange } from '@/lib/finance/profitability';
import { brtDayStart } from '@/lib/staff/commission-rules';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * GET /api/reports/profitability?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD - Relatórios › Lucratividade:
 * Brasília days, end day included, owner and managers only (lib/finance/profitability.ts).
 */
export async function GET(request: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const auth = await requireRestaurantRole(MANAGER_ROLES);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') ?? '';
  const endDate = searchParams.get('endDate') ?? '';
  if (!DAY.test(startDate) || !DAY.test(endDate)) {
    return NextResponse.json({ error: 'startDate e endDate são obrigatórios (AAAA-MM-DD)' }, { status: 400 });
  }
  try {
    const report = await profitabilityInRange(auth.member.restaurantId, brtDayStart(startDate), brtDayStart(nextDay(endDate)));
    return NextResponse.json({ period: `${br(startDate)} a ${br(endDate)}`, ...report });
  } catch (error) {
    console.error('[reports/profitability] failed:', error);
    return NextResponse.json({ error: 'Não foi possível gerar o relatório' }, { status: 500 });
  }
}
