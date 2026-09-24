import type { OrderSessionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';

/**
 * Turns "what is the customer paying for" into a restaurant plus an amount
 * computed ON THE SERVER. The browser never decides the amount or the
 * restaurant.
 */

export interface ResolvedPixTarget {
  restaurantId: string;
  amount: number;
  description: string;
  orderId: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown>;
  /**
   * Set only for a target that is an ORDER: how the customer chose to pay it
   * (null for legacy and table orders). Lets a route refuse an order that was
   * not created for the payment method it is being paid with.
   */
  orderPaymentMethod?: string | null;
}

export type ResolveResult =
  | { ok: true; target: ResolvedPixTarget }
  | { ok: false; status: number; error: string };

const OPEN_SESSION_STATUSES: OrderSessionStatus[] = ['OPEN', 'SENT_TO_KITCHEN', 'READY'];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Shown when someone asks for a PIX for an order created with another payment method. */
export const PIX_NOT_FOR_THIS_ORDER = 'Este pedido não foi feito com pagamento por PIX online.';

/**
 * An order can be paid by PIX only if it was created for it (ONLINE_PIX) or has
 * no recorded method (legacy and table/QR orders). A CASH, card or
 * pay-on-delivery order must not be settled online: its kitchen note still
 * tells the driver to collect the payment at the door.
 */
export function orderAcceptsPix(paymentMethod: string | null | undefined): boolean {
  return paymentMethod == null || paymentMethod === 'ONLINE_PIX';
}

async function resolveOrder(orderId: string): Promise<ResolveResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      restaurantId: true,
      orderNumber: true,
      total: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
    },
  });
  if (!order) return { ok: false, status: 404, error: 'Pedido não encontrado' };
  if (order.paymentStatus === 'APPROVED') return { ok: false, status: 409, error: 'Pedido já pago' };
  if (order.status === 'CANCELLED') return { ok: false, status: 409, error: 'Pedido cancelado' };

  const amount = round2(Number(order.total ?? 0));
  if (!(amount > 0)) return { ok: false, status: 400, error: 'Pedido sem valor a pagar' };

  return {
    ok: true,
    target: {
      restaurantId: order.restaurantId,
      amount,
      description: `Pedido ${order.orderNumber}`,
      orderId: order.id,
      sessionId: null,
      metadata: { source: 'delivery', orderNumber: order.orderNumber },
      orderPaymentMethod: order.paymentMethod ?? null,
    },
  };
}

async function resolveTable(qrToken: string): Promise<ResolveResult> {
  const table = await prisma.table.findUnique({
    where: { qrToken },
    select: { id: true, number: true, restaurantId: true },
  });
  if (!table) return { ok: false, status: 404, error: 'Mesa não encontrada' };

  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: OPEN_SESSION_STATUSES } },
    orderBy: { openedAt: 'desc' },
    select: {
      id: true,
      items: {
        select: {
          price: true,
          quantity: true,
          // Paid modifiers are NOT included in OrderSessionItem.price (that is
          // the base menu price); their surcharge lives here.
          modifiers: { select: { priceAdjustment: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, status: 409, error: 'Nenhuma comanda aberta nesta mesa' };

  // A comanda line costs (price + the adjustments of its modifiers) * quantity: a
  // modifier's surcharge applies to EACH unit (owner's rule, 2026-09-24). The same
  // function prices the comanda screen and the revenue reports.
  const totalCents = session.items.reduce(
    (sum, item) => sum + lineTotalCents(item.price, item.quantity, item.modifiers.map((m) => m.priceAdjustment)),
    0
  );
  const amount = totalCents / 100;
  if (!(amount > 0)) return { ok: false, status: 409, error: 'A comanda está vazia' };

  return {
    ok: true,
    target: {
      restaurantId: table.restaurantId,
      amount,
      description: `Mesa ${table.number}`,
      orderId: null,
      sessionId: session.id,
      metadata: { source: 'table', sessionId: session.id, tableId: table.id, tableNumber: table.number },
    },
  };
}

export async function resolvePixTarget(input: { orderId?: unknown; qrToken?: unknown }): Promise<ResolveResult> {
  if (typeof input.orderId === 'string' && input.orderId) return resolveOrder(input.orderId);
  if (typeof input.qrToken === 'string' && input.qrToken) return resolveTable(input.qrToken);
  return { ok: false, status: 400, error: 'Informe orderId ou qrToken' };
}

/** Sanity cap (R$) for an amount typed by staff. */
export const MAX_MANUAL_AMOUNT = 100_000;

/**
 * The dashboard's "PIX avulso": there is no order, and a signed-in staff
 * member of the restaurant chooses the amount. The restaurant comes from the
 * session (the caller passes it), never from the request body.
 */
export function buildManualPixTarget(input: {
  restaurantId: string;
  amount: unknown;
  description?: unknown;
}): ResolveResult {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MANUAL_AMOUNT) {
    return { ok: false, status: 400, error: 'Informe um valor válido' };
  }
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 100)
      : 'Pagamento PIX';

  return {
    ok: true,
    target: {
      restaurantId: input.restaurantId,
      amount,
      description,
      orderId: null,
      sessionId: null,
      metadata: { source: 'manual' },
    },
  };
}
