import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/cashback/rules';
import { normalizeQuantity } from '@/lib/delivery-payments/order-input';
import { checkCoupon } from '@/lib/coupons/service';
import { clientAddress, takeCouponTry } from '@/lib/coupons/attempts';
import { offeredToday } from '@/lib/cardapio/days-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/delivery/coupon { restaurantId, code, customerPhone, items, deliveryFee, pickup } - the coupon
 * preview on the delivery site (spec 2026-11-08 cupons §1): the subtotal comes from the menu prices, nothing is
 * written. The order creation checks everything again.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : '';
  if (!restaurantId || !Array.isArray(body?.items) || !body.items.length) return NextResponse.json({ error: 'Pedido vazio' }, { status: 400 });
  if (!takeCouponTry(clientAddress(req.headers), restaurantId)) return NextResponse.json({ error: 'Muitas tentativas. Espere um minuto.' }, { status: 429 });
  const ids = body.items.map((i: any) => i?.menuItemId).filter((x: unknown) => typeof x === 'string').slice(0, 200);
  const menu = await prisma.menuItem.findMany({
    where: { id: { in: ids }, restaurantId, active: true, available: true, soldByWeight: false, ...(await offeredToday(restaurantId)) },
    select: { id: true, price: true },
  });
  const price = new Map(menu.map((m) => [m.id, Number(m.price)]));
  let subtotal = 0;
  for (const i of body.items) if (price.has(i?.menuItemId)) subtotal += price.get(i.menuItemId)! * normalizeQuantity(i.quantity);
  const fee = body.pickup === true ? 0 : Math.max(0, Number(body.deliveryFee) || 0);
  // No phone rules here: an unauthenticated preview would tell whether a phone already ordered (security review
  // 2026-11-08). The order creation applies them.
  const r = await checkCoupon(restaurantId, body.code, '', Math.round(subtotal * 100), Math.round(fee * 100), new Date(), { phoneRules: false });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({ code: r.code, label: r.label, discountCents: r.discountCents }, { headers: { 'Cache-Control': 'no-store' } });
}
