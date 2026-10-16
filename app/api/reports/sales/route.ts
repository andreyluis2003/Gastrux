import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { itemSalesInRange } from '@/lib/finance/item-sales';
import { salesInRange } from '@/lib/finance/month-sales';
import { brtDayStart } from '@/lib/staff/commission-rules';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * GET /api/reports/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD - Relatórios › Vendas with the Caixa
 * criterion (owner 2026-10-16): the same totals as the DRE and the Caixa; items by what was sold, at the
 * price charged; categories from the menu; Brasília days; owner and managers only.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'O relatório de vendas é do dono e do gerente');
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') ?? '';
  const endDate = searchParams.get('endDate') ?? '';
  if (!DAY.test(startDate) || !DAY.test(endDate)) {
    return NextResponse.json({ error: 'startDate e endDate são obrigatórios (AAAA-MM-DD)' }, { status: 400 });
  }
  try {
    const { restaurantId } = auth.member;
    const from = brtDayStart(startDate);
    const to = brtDayStart(nextDay(endDate));
    const [sales, items] = await Promise.all([salesInRange(restaurantId, from, to), itemSalesInRange(restaurantId, from, to)]);
    const totalSales = sales.totalCents / 100;
    const totalOrders = sales.salesCount;
    const itemsTotal = items.reduce((s, i) => s + i.revenue, 0);
    const byCategory = new Map<string, { category: string; sales: number; percentage: number }>();
    for (const i of items) {
      const c = byCategory.get(i.category) ?? { category: i.category, sales: 0, percentage: 0 };
      c.sales = Math.round((c.sales + i.revenue) * 100) / 100;
      byCategory.set(i.category, c);
    }
    for (const c of byCategory.values()) c.percentage = itemsTotal > 0 ? (c.sales / itemsTotal) * 100 : 0;
    return NextResponse.json({
      period: `${br(startDate)} a ${br(endDate)}`,
      totalSales,
      totalOrders,
      averageTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
      topDishes: items.map((i) => ({ name: i.name, quantity: i.quantity, revenue: i.revenue })),
      byCategory: [...byCategory.values()].sort((a, b) => b.sales - a.sales),
    });
  } catch (error) {
    console.error('[reports/sales] failed:', error);
    return NextResponse.json({ error: 'Não foi possível gerar o relatório' }, { status: 500 });
  }
}
