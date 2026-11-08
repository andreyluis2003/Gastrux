import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** PATCH { active } - pause or turn a coupon back on; a used coupon is never deleted (spec 2026-11-08 cupons §5) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'Cupons são do dono e do gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.active !== 'boolean') return NextResponse.json({ error: 'Ativar ou pausar?' }, { status: 400 });
  const done = await prisma.coupon.updateMany({ where: { id: params.id, restaurantId: auth.member.restaurantId }, data: { active: body.active } });
  if (!done.count) return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 });
  await recordAudit(auth.member, { action: 'UPDATE', entityType: 'Coupon', entityId: params.id, changes: { active: body.active } });
  return NextResponse.json({ ok: true });
}
