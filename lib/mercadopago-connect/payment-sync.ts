import type { PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mapMPStatusToPaymentStatus } from '@/lib/mercado-pago';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { getConnectPayment, isUnauthorizedError } from './payments';
import { canTransition } from './payment-status';

export interface SyncResult {
  updated: boolean;
  reason?: string;
  status?: string;
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Writes that follow the Payment update: marks the linked Order paid and
 * mirrors the MP data on the preference-based MercadoPagoTransaction row.
 * Both writes are idempotent and scoped, so they are safe to repeat; the
 * self-healing branch in syncRestaurantPayment relies on that.
 */
async function applyLinkedRecords(
  restaurantId: string,
  payment: { id: string; orderId: string | null },
  mp: any,
  orderStatus: 'APPROVED' | 'REFUNDED' | 'CHARGEBACK' | null
): Promise<void> {
  if (orderStatus && payment.orderId) {
    await prisma.order.updateMany({
      where: {
        id: payment.orderId,
        restaurantId,
        // Paying moves the order off anything but APPROVED; a refund or a
        // chargeback moves it ONLY off APPROVED, so the KDS/POS stops showing
        // a refunded order as paid and neither move can happen twice.
        paymentStatus: orderStatus === 'APPROVED' ? { not: 'APPROVED' } : 'APPROVED',
      },
      data: { paymentStatus: orderStatus },
    });
  }

  // Preference-based checkouts also keep a MercadoPagoTransaction row.
  await prisma.mercadoPagoTransaction.updateMany({
    where: { paymentId: payment.id },
    data: {
      mpPaymentId: String(mp.id),
      mpStatus: mp.status,
      mpStatusDetail: mp.status_detail,
      lastWebhookAt: new Date(),
    },
  });
}

/**
 * Applies a Mercado Pago payment to OUR Payment (and Order) records, using the
 * restaurant's own token to fetch it. Used by the webhook and by the PIX
 * status reconciliation. Safe to call repeatedly and concurrently.
 */
export async function syncRestaurantPayment(restaurantId: string, mpPaymentId: string): Promise<SyncResult> {
  const client = await getMpClientForRestaurant(restaurantId);
  if (!client) return { updated: false, reason: 'no-active-connection' };

  let mp: any;
  try {
    mp = await getConnectPayment(client, mpPaymentId);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      await markNeedsReconnect(restaurantId, 'Mercado Pago rejeitou o token (401)');
      return { updated: false, reason: 'unauthorized' };
    }
    throw error;
  }

  const paymentId: string | undefined = mp?.external_reference;
  if (!paymentId) return { updated: false, reason: 'no-external-reference' };

  // Tenant guard: the payment must belong to THIS restaurant and this gateway.
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, restaurantId, gateway: 'MERCADO_PAGO_CONNECT' },
  });
  if (!payment) return { updated: false, reason: 'payment-not-found' };

  // For PIX we recorded the Mercado Pago id at creation; another MP payment
  // reusing the same external_reference must not be able to approve it.
  if (payment.method === 'PIX' && payment.gatewayPaymentId && payment.gatewayPaymentId !== String(mp.id)) {
    return { updated: false, reason: 'mp-id-mismatch' };
  }

  const mapped = mapMPStatusToPaymentStatus(mp.status) as PaymentStatus;
  const amountMatches = Number(mp.transaction_amount) === Number(payment.amount);

  if (!canTransition(payment.status, mapped)) {
    // Self-healing: the Payment write and the Order write are not one
    // transaction. If a previous run committed the Payment as APPROVED and then
    // failed before the Order write, no later notification would ever mark the
    // Order paid, because APPROVED -> APPROVED is not a transition. So repeat
    // the idempotent linked writes. Runs only for an APPROVED notification on
    // an already APPROVED Payment whose MP id was checked above and whose
    // amount matches; it never touches the Payment row.
    if (mapped === 'APPROVED' && payment.status === 'APPROVED' && payment.orderId && amountMatches) {
      await applyLinkedRecords(restaurantId, payment, mp, 'APPROVED');
    }
    return { updated: false, reason: 'no-transition' };
  }

  if (mapped === 'APPROVED' && !amountMatches) {
    console.warn(
      `[mp-connect] amount mismatch for payment ${payment.id}: expected ${payment.amount}, MP reported ${mp.transaction_amount}`
    );
    return { updated: false, reason: 'amount-mismatch' };
  }

  const fee = ((mp.fee_details as Array<{ amount?: number }>) || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const approved = mapped === 'APPROVED';

  // Optimistic concurrency: only apply if the status is still the one we read.
  const result = await prisma.payment.updateMany({
    where: { id: payment.id, restaurantId, status: payment.status },
    data: {
      status: mapped,
      gatewayPaymentId: String(mp.id),
      processedAt: approved ? new Date() : undefined,
      gatewayFee: approved ? fee : undefined,
      netAmount: approved ? Number(payment.amount) - fee : undefined,
      metadata: JSON.stringify({
        ...parseMetadata(payment.metadata),
        mpPaymentId: String(mp.id),
        mpStatus: mp.status,
        mpStatusDetail: mp.status_detail,
      }),
    },
  });
  if (result.count === 0) return { updated: false, reason: 'concurrent' };

  // A REFUNDED or CHARGEBACK notification must also move the Order off
  // APPROVED, otherwise the KDS/POS keeps showing a refunded order as paid.
  const orderStatus: 'APPROVED' | 'REFUNDED' | 'CHARGEBACK' | null = approved
    ? 'APPROVED'
    : mapped === 'REFUNDED' || mapped === 'CHARGEBACK'
    ? mapped
    : null;

  await applyLinkedRecords(restaurantId, payment, mp, orderStatus);

  return { updated: true, status: mapped };
}
