import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { normalizePhone } from '@/lib/cashback/rules';
import { balanceCents, findCustomerByPhone, getCashbackSettings } from '@/lib/cashback/service';

export const dynamic = 'force-dynamic';

/** GET ?phone= - the customer of this phone in this restaurant and the cashback to use (the counter and the bill) */
export async function GET(req: NextRequest) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Consultar o cliente exige o caixa');
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  const phone = normalizePhone(new URL(req.url).searchParams.get('phone'));
  if (!phone) return NextResponse.json({ error: 'Celular inválido: use DDD e número' }, { status: 400 });
  const [customer, settings] = await Promise.all([findCustomerByPhone(prisma, restaurantId, phone), getCashbackSettings(restaurantId)]);
  return NextResponse.json({
    customer: customer ? { id: customer.id, name: customer.name } : null,
    balanceCents: customer ? await balanceCents(prisma, restaurantId, customer.id) : 0,
    available: settings.available && settings.enabled,
  });
}
