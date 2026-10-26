import { NextRequest, NextResponse } from 'next/server';
import { ExternalOrderStatus } from '@prisma/client';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { DeliveryOrderError, acceptDeliveryOrder, rejectDeliveryOrder } from '@/lib/delivery-orders/ingest';
import { notifyOrderStatus } from '@/lib/delivery-orders/callback';
import { answerDispute, cancelPlatformOrder, isPlatformOrder, pushPlatformStatus } from '@/lib/delivery-orders/platform-sync';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { canMoveExternalOrderStatus } from '@/lib/delivery-integration/external-order-status';
import { normalizeDriverName } from '@/lib/caixa/driver-settlement';

export const dynamic = 'force-dynamic';

const DENIED = 'Pedidos de delivery é da equipe do salão e do caixa';

/** GET /api/admin/integrations/orders/[id] - one order, without the integration secrets */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  const order = await prisma.externalOrder.findFirst({
    where: { id: params.id, restaurantId: auth.member.restaurantId },
    include: { integration: { select: { platform: true, storeName: true } }, deliveryLogs: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  return NextResponse.json(order);
}

/**
 * PATCH /api/admin/integrations/orders/[id] { action: 'accept' } | { action: 'reject', reason, cancelCode? } (plan 2026-10-23
 * api-de-pedidos, Task 7): accepting creates the kitchen order once; rejecting needs a reason (iFood: one of its codes).
 * iFood only (plan 2026-10-24 ifood, Task 8): { action: 'cancel', cancelCode, reason } cancels an accepted order (a
 * manager, as in the kitchen); { action: 'dispute-accept' | 'dispute-reject' } answers the customer's cancel request.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.action === 'accept') {
      return NextResponse.json(await acceptDeliveryOrder(auth.member.restaurantId, params.id, { userId: auth.member.userId }));
    }
    if (body?.action === 'reject') {
      await rejectDeliveryOrder(auth.member, params.id, body?.reason, body?.cancelCode);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === 'cancel') {
      if (![...MANAGER_ROLES, 'ADMIN'].includes(auth.member.role)) {
        return NextResponse.json({ error: 'Cancelar um pedido aceito exige um gerente' }, { status: 403 });
      }
      await cancelPlatformOrder(auth.member, params.id, { code: body?.cancelCode, reason: body?.reason });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === 'dispute-accept' || body?.action === 'dispute-reject') {
      await answerDispute(auth.member, params.id, body.action === 'dispute-accept' ? 'accept' : 'reject');
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (e) {
    if (e instanceof DeliveryOrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/**
 * PUT /api/admin/integrations/orders/[id] { status } - moves an accepted order forward (ready, out for delivery,
 * delivered). Leaving "Novo" goes through accept or reject: a status change alone skipped the kitchen order.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  const { status, driverName } = await request.json().catch(() => ({}));
  if (!status || !Object.values(ExternalOrderStatus).includes(status)) return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  const order = await prisma.externalOrder.findFirst({ where: { id: params.id, restaurantId: auth.member.restaurantId } });
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (order.status === 'PENDING') return NextResponse.json({ error: 'Use Aceitar ou Recusar neste pedido' }, { status: 409 });
  if (!canMoveExternalOrderStatus(order.status, status)) return NextResponse.json({ error: 'Este pedido não pode ir para esse status' }, { status: 409 });
  // iFood cancels only with one of its reasons; a status change here would leave the order alive on iFood
  const ifood = await isPlatformOrder(order.id);
  if (ifood && (status === 'CANCELLED' || status === 'REJECTED')) {
    return NextResponse.json({ error: 'Pedido do iFood: use "Cancelar Pedido" e escolha o motivo do iFood' }, { status: 409 });
  }
  // An accepted order has a kitchen order: cancelling only here left the kitchen cooking it
  if ((status === 'CANCELLED' || status === 'REJECTED') && order.internalOrderId) {
    const kitchen = await prisma.order.findUnique({ where: { id: order.internalOrderId }, select: { status: true } });
    if (kitchen && kitchen.status !== 'CANCELLED') return NextResponse.json({ error: 'Este pedido já está na cozinha: cancele pela tela da cozinha (exige um gerente)' }, { status: 409 });
  }
  // "Saiu para entrega" takes who took it, for the driver settlement in the Caixa (spec 2026-10-26)
  const driver = status === 'PICKED_UP' && driverName !== undefined ? { driverName: normalizeDriverName(driverName) } : {};
  const moved = await prisma.externalOrder.updateMany({ where: { id: order.id, status: order.status }, data: { status, ...driver } });
  if (moved.count === 0) return NextResponse.json({ error: 'O pedido mudou enquanto era atualizado. Atualize a tela.' }, { status: 409 });
  await prisma.deliveryLog.create({
    data: { externalOrderId: order.id, eventType: 'STATUS_CHANGED', previousStatus: order.status, newStatus: status, message: 'Status mudado em Pedidos de delivery', eventTimestamp: new Date() },
  });
  void notifyOrderStatus(order.id);
  // A step made by hand goes to iFood too, as when the kitchen makes it (dispatch only for the store's own delivery)
  const toPlatform = { PREPARING: 'preparing', READY: 'ready', PICKED_UP: 'dispatch' } as const;
  if (ifood && status in toPlatform) await pushPlatformStatus(order.id, toPlatform[status as keyof typeof toPlatform]);
  return NextResponse.json(await prisma.externalOrder.findUnique({ where: { id: order.id }, include: { deliveryLogs: { orderBy: { createdAt: 'desc' }, take: 5 } } }));
}
