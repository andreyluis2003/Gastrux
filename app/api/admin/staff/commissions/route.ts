import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRestaurantMember, isManager, recordAudit, requireRestaurantRole, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { brtDay, periodContaining, periodLabel, type CommissionPeriodType } from '@/lib/staff/commission-rules';
import { closePeriod, salesByStaff } from '@/lib/staff/commissions';

export const dynamic = 'force-dynamic';

const PERIODS: CommissionPeriodType[] = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * GET ?view=WEEKLY|BIWEEKLY|MONTHLY&date=YYYY-MM-DD: sales and commission per person in that period,
 * live, plus the records already closed for payment. A manager sees the whole team; anyone else
 * only their own lines (the list used to show everyone's to any logged-in staff member).
 */
export async function GET(req: NextRequest) {
  const member = await getRestaurantMember();
  if (!member) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const manager = isManager(member);

  const restaurant = await prisma.restaurant.findUnique({ where: { id: member.restaurantId }, select: { commissionPayPeriod: true } });
  const payPeriod = (restaurant?.commissionPayPeriod ?? 'MONTHLY') as CommissionPeriodType;
  const viewParam = req.nextUrl.searchParams.get('view') as CommissionPeriodType | null;
  const view = viewParam && PERIODS.includes(viewParam) ? viewParam : 'MONTHLY';
  const dateParam = req.nextUrl.searchParams.get('date');
  const bounds = periodContaining(view, isDay(dateParam) ? dateParam : brtDay(new Date()));

  const all = await salesByStaff(member.restaurantId, bounds);
  const rows = manager ? all : all.filter((r) => r.userId === member.userId);

  const records = await prisma.staffCommission.findMany({
    where: { staffMember: { restaurantId: member.restaurantId, ...(manager ? {} : { userId: member.userId }) } },
    include: { staffMember: { select: { userId: true, user: { select: { name: true, email: true } } } } },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  return NextResponse.json({
    view,
    period: { firstDay: bounds.firstDay, lastDay: bounds.lastDay, label: periodLabel(bounds) },
    payPeriod,
    canManage: manager,
    rows,
    totals: {
      bills: rows.reduce((s, r) => s + r.bills, 0),
      salesCents: rows.reduce((s, r) => s + r.salesCents, 0),
      commissionCents: rows.reduce((s, r) => s + r.commissionCents, 0),
    },
    records: records.map((c) => ({
      id: c.id,
      name: c.staffMember.user?.name || c.staffMember.user?.email || 'Funcionário',
      periodType: c.periodType,
      label: periodLabel(periodContaining(c.periodType as CommissionPeriodType, c.period.toISOString().slice(0, 10))),
      bills: c.billsCount,
      totalSales: Number(c.totalSales),
      commissionEarned: Number(c.commissionEarned),
      bonusEarned: Number(c.bonusEarned),
      totalEarned: Number(c.totalEarned),
      status: c.status,
      paidAt: c.paidAt,
      notes: c.notes,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** POST { action: 'close', date, periodType? }: closes the pay period that contains `date` (manager) */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Fechar comissões exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (body.action !== 'close' || !isDay(body.date)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({ where: { id: auth.member.restaurantId }, select: { commissionPayPeriod: true } });
  const type = PERIODS.includes(body.periodType) ? body.periodType : ((restaurant?.commissionPayPeriod ?? 'MONTHLY') as CommissionPeriodType);
  const result = await closePeriod(auth.member, type, body.date);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

/** PATCH { payPeriod }: when commissions are paid (manager) */
export async function PATCH(req: NextRequest) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Mudar o período de pagamento exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (!PERIODS.includes(body.payPeriod)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
  const before = await prisma.restaurant.findUnique({ where: { id: auth.member.restaurantId }, select: { commissionPayPeriod: true } });
  await prisma.restaurant.update({ where: { id: auth.member.restaurantId }, data: { commissionPayPeriod: body.payPeriod } });
  await recordAudit(auth.member, {
    action: 'UPDATE',
    entityType: 'Restaurant',
    entityId: auth.member.restaurantId,
    changes: { commissionPayPeriod: { from: before?.commissionPayPeriod, to: body.payPeriod } },
  });
  return NextResponse.json({ payPeriod: body.payPeriod });
}
