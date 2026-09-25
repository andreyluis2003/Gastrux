import { prisma } from '@/lib/prisma';
import { getSessionTotalCents } from '@/lib/comanda/session-total';
import { toCents } from '@/lib/comanda/line-total';
import { createPaymentAlert } from '@/lib/payment-alert-service';

function sessionIdOf(metadata: string | null): string | null {
  try {
    const id = (metadata ? JSON.parse(metadata) : {})?.sessionId;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

/**
 * A table PIX was just approved. The tab can have changed since the QR was generated (an item
 * added, a modifier removed...), so the approved PIX payments of the tab may no longer add up to
 * what it costs. Nothing links a table payment to the comanda, so without this the difference goes
 * unnoticed: the operator is told, once per distinct situation, either that part of the tab is still
 * unpaid or that the customer paid more than the tab. Never throws (it must not break the sync).
 */
export async function reconcileTabPayment(
  restaurantId: string,
  payment: { id: string; orderId: string | null; metadata: string | null }
): Promise<void> {
  try {
    if (payment.orderId) return;
    const sessionId = sessionIdOf(payment.metadata);
    if (!sessionId) return;

    const tab = await getSessionTotalCents(restaurantId, sessionId);
    if (!tab) return;

    const approved = await prisma.payment.findMany({
      where: {
        restaurantId,
        gateway: 'MERCADO_PAGO_CONNECT',
        orderId: null,
        status: { in: ['APPROVED', 'PARTIALLY_REFUNDED', 'SETTLED'] },
        metadata: { contains: `"sessionId":"${sessionId}"` },
      },
      select: { amount: true },
    });
    const paidCents = approved.reduce((sum, p) => sum + toCents(p.amount), 0);
    if (paidCents === tab.totalCents) return;

    const table = tab.tableNumber != null ? `Mesa ${tab.tableNumber}` : 'A comanda';
    const short = paidCents < tab.totalCents;
    await createPaymentAlert({
      alertType: short ? 'failure' : 'refund',
      severity: 'high',
      title: short ? 'PIX da mesa aprovado não cobre a comanda' : 'PIX da mesa maior que a comanda',
      message: short
        ? `${table}: os PIX aprovados somam ${brl(paidCents)} e a comanda está em ${brl(tab.totalCents)} (faltam ${brl(tab.totalCents - paidCents)}). A comanda mudou depois de o QR ser gerado: cobre a diferença antes de fechar a mesa.`
        : `${table}: os PIX aprovados somam ${brl(paidCents)} e a comanda está em ${brl(tab.totalCents)} (sobram ${brl(paidCents - tab.totalCents)}). Reembolse a diferença ou registre o motivo.`,
      paymentId: payment.id,
      gateway: 'MERCADO_PAGO_CONNECT',
      amount: Math.abs(paidCents - tab.totalCents) / 100,
      restaurantId,
      dedupeKey: `tab-mismatch:${sessionId}:${paidCents}:${tab.totalCents}`,
    });
  } catch (error) {
    console.error('[mp-connect] could not reconcile a table payment with its tab:', error);
  }
}
