import { prisma } from '@/lib/prisma';

/**
 * Bell alerts of pay at the table (spec 2026-10-10 §5.2): restaurant-wide (no userId), so owner, manager and
 * admin see them (lib/notification-utils.ts notificationAudience). One per dedupe key; never throws.
 */
async function notify(restaurantId: string, kind: string, dedupeKey: string, title: string, message: string, severity: 'MEDIUM' | 'HIGH', extra: Record<string, unknown>) {
  try {
    const existing = await prisma.notification.findFirst({
      where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: {
        restaurantId, type: kind === 'table-paid' ? 'PAYMENT_RECEIVED' : 'SYSTEM_ERROR', severity, title, message,
        actionUrl: '/vender', actionLabel: 'Ver mesas', data: { kind, dedupeKey, ...extra },
      },
    });
  } catch (error) {
    console.error('Could not store the table payment alert:', error);
  }
}

// Intl puts a no-break space after "R$"; plain text keeps the alert easy to search and compare
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

export function alertTablePaid(restaurantId: string, sessionId: string, label: string, totalCents: number) {
  return notify(restaurantId, 'table-paid', `table-paid:${sessionId}`, `${label} paga pelo celular`,
    `${label} pagou ${brl(totalCents)} pelo celular. A conta foi fechada e a mesa está livre.`, 'MEDIUM', { orderSessionId: sessionId });
}

export function alertTableOverpaid(restaurantId: string, sessionId: string, label: string, overpaidCents: number, paymentId: string) {
  return notify(restaurantId, 'table-overpaid', `table-overpaid:${paymentId}`, `${label} pagou a mais pelo celular`,
    `${label} pagou ${brl(overpaidCents)} a mais pelo celular. Devolva em Pagamentos com o botão Estornar.`, 'HIGH', { orderSessionId: sessionId, paymentId });
}

export function alertOnlineWithoutShift(restaurantId: string, sessionId: string, label: string, amountCents: number, paymentId: string) {
  return notify(restaurantId, 'table-no-shift', `table-no-shift:${paymentId}`, 'Pagamento online recebido sem caixa aberto',
    `${label} pagou ${brl(amountCents)} pelo celular sem caixa aberto. O valor entrou na conta, fora de qualquer turno.`, 'HIGH', { orderSessionId: sessionId, paymentId });
}
