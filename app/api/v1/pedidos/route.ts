import { NextRequest, NextResponse } from 'next/server';
import { restaurantAcceptsOrders } from '@/lib/billing/order-gate';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { authenticateOrderApiKey } from '@/lib/delivery-orders/api-keys';
import { parseOrderApiInput } from '@/lib/delivery-orders/input';
import { DeliveryOrderError, ingestDeliveryOrder } from '@/lib/delivery-orders/ingest';
import { publicStatus } from '@/lib/delivery-orders/status';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 256 * 1024;

/**
 * POST /api/v1/pedidos - the Gastrux order API (plan 2026-10-23 api-de-pedidos, Task 5; docs on /desenvolvedores).
 * `Authorization: Bearer gx_live_...`. 201 for a new order, 200 with the same body when the same `codigo` comes again.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateOrderApiKey(req.headers.get('authorization'));
  if (!auth) return NextResponse.json({ erro: 'Chave de API inválida' }, { status: 401 });
  if (!isTierFeatureEnabled(await restaurantTier(auth.restaurantId), 'orderApi')) {
    return NextResponse.json({ erro: 'A API de pedidos é dos planos Pro e Business', upgradeUrl: '/pricing' }, { status: 403 });
  }
  if (!(await restaurantAcceptsOrders(auth.restaurantId))) {
    return NextResponse.json({ erro: 'Este restaurante não está recebendo pedidos agora.', code: 'RESTAURANT_UNAVAILABLE' }, { status: 403 });
  }
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ erro: 'O pedido passa de 256 KB' }, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return NextResponse.json({ erro: 'O pedido passa de 256 KB' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ erro: 'pedido: o corpo não é um JSON válido' }, { status: 400 });
  }
  const parsed = parseOrderApiInput(body);
  if (!parsed.ok) return NextResponse.json({ erro: parsed.error }, { status: 400 });

  let r: Awaited<ReturnType<typeof ingestDeliveryOrder>>;
  try {
    r = await ingestDeliveryOrder({ restaurantId: auth.restaurantId, integrationId: auth.integrationId, apiKeyId: auth.apiKeyId, platform: 'gastrux_api', input: parsed.value });
  } catch (e) {
    // The code of another origin of the restaurant (409, final review 2026-10-24)
    if (e instanceof DeliveryOrderError) return NextResponse.json({ erro: e.message }, { status: e.status });
    throw e;
  }
  const kitchen = r.kitchenOrderId ? await prisma.order.findUnique({ where: { id: r.kitchenOrderId }, select: { status: true } }) : null;
  const status = publicStatus(r.externalOrder.status, kitchen?.status ?? null);
  return NextResponse.json(
    { id: r.externalOrder.id, codigo: r.externalOrder.externalOrderId, status, aceito: r.externalOrder.status !== 'PENDING' && status !== 'cancelado' },
    { status: r.duplicate ? 200 : 201 },
  );
}
