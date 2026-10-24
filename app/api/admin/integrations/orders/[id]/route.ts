import { NextRequest, NextResponse } from 'next/server';
import { ExternalOrderStatus } from '@prisma/client';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { DeliveryOrderError, acceptDeliveryOrder, rejectDeliveryOrder } from '@/lib/delivery-orders/ingest';
import { notifyOrderStatus } from '@/lib/delivery-orders/callback';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { canMoveExternalOrderStatus } from '@/lib/delivery-integration/external-order-status';

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
 * PATCH /api/admin/integrations/orders/[id] { action: 'accept' } | { action: 'reject', reason } (plan 2026-10-23
 * api-de-pedidos, Task 7): accepting creates the kitchen order once; rejecting needs a reason
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
      await rejectDeliveryOrder(auth.member, params.id, body?.reason);
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
  const { status } = await request.json().catch(() => ({}));
  if (!status || !Object.values(ExternalOrderStatus).includes(status)) return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  const order = await prisma.externalOrder.findFirst({ where: { id: params.id, restaurantId: auth.member.restaurantId } });
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (order.status === 'PENDING') return NextResponse.json({ error: 'Use Aceitar ou Recusar neste pedido' }, { status: 409 });
  if (!canMoveExternalOrderStatus(order.status, status)) return NextResponse.json({ error: 'Este pedido não pode ir para esse status' }, { status: 409 });
  // An accepted order has a kitchen order: cancelling only here left the kitchen cooking it
  if ((status === 'CANCELLED' || status === 'REJECTED') && order.internalOrderId) {
    const kitchen = await prisma.order.findUnique({ where: { id: order.internalOrderId }, select: { status: true } });
    if (kitchen && kitchen.status !== 'CANCELLED') return NextResponse.json({ error: 'Este pedido já está na cozinha: cancele pela tela da cozinha (exige um gerente)' }, { status: 409 });
  }
  const moved = await prisma.externalOrder.updateMany({ where: { id: order.id, status: order.status }, data: { status } });
  if (moved.count === 0) return NextResponse.json({ error: 'O pedido mudou enquanto era atualizado. Atualize a tela.' }, { status: 409 });
  await prisma.deliveryLog.create({
    data: { externalOrderId: order.id, eventType: 'STATUS_CHANGED', previousStatus: order.status, newStatus: status, message: 'Status mudado em Pedidos de delivery', eventTimestamp: new Date() },
  });
  void notifyOrderStatus(order.id);
  return NextResponse.json(await prisma.externalOrder.findUnique({ where: { id: order.id }, include: { deliveryLogs: { orderBy: { createdAt: 'desc' }, take: 5 } } }));
}
