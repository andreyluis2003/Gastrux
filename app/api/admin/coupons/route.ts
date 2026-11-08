import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { parseCouponInput } from '@/lib/coupons/rules';

export const dynamic = 'force-dynamic';
const ROLES = [...MANAGER_ROLES, 'ADMIN' as const];
const DENIED = 'Cupons são do dono e do gerente';

/** GET - the coupons with their uses and the discount given (spec 2026-11-08 cupons §5) */
export async function GET() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const rid = auth.member.restaurantId;
  const [coupons, sums] = await Promise.all([
    prisma.coupon.findMany({ where: { restaurantId: rid }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }),
    prisma.couponRedemption.groupBy({ by: ['couponId'], where: { restaurantId: rid }, _sum: { discountCents: true } }),
  ]);
  const given = new Map(sums.map((s) => [s.couponId, s._sum.discountCents ?? 0]));
  return NextResponse.json(coupons.map((c) => ({ ...c, discountGivenCents: given.get(c.id) ?? 0 })), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST - a new coupon */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const v = parseCouponInput(await req.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const c = await prisma.coupon.create({ data: { ...v.value, restaurantId: auth.member.restaurantId, createdById: auth.member.userId } });
    await recordAudit(auth.member, { action: 'CREATE', entityType: 'Coupon', entityId: c.id, changes: { code: c.code, kind: c.kind, value: c.value } });
    return NextResponse.json(c, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Já existe um cupom com este código' }, { status: 409 });
    throw e;
  }
}
