import type { DeliveryPaymentMethod, DeliveryPlatform, ExternalOrder } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { createOrderFromExternalOrder } from '@/lib/kds-integration';
import { noteSalesThresholds } from '@/lib/plans/monthly-sales';
import { formatPhone } from '@/lib/cashback/rules';
import { findCustomerByPhone } from '@/lib/cashback/service';
import { sanitizeCustomerNote } from '@/lib/delivery-payments/order-input';
import type { OrderApiInput } from './input';
import { notifyOrderStatus } from './callback';

/**
 * One pipeline for incoming delivery orders (plan 2026-10-23 api-de-pedidos, Task 4): the Gastrux order API now, the
 * digital menu (Task 4b) and the platforms of parts 2 and 3 later. The order is kept as it came (ExternalOrder,
 * idempotent by its code), accepted by itself or after "Aceitar", and only then becomes a kitchen order with its values.
 */
export class DeliveryOrderError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Platforms whose customer is the restaurant's: they make the customer in the CRM and earn cashback */
const OWN_CUSTOMERS: DeliveryPlatform[] = ['gastrux_api', 'delivery_site'];

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

export function paymentMethodOf(p: OrderApiInput['pagamento']): DeliveryPaymentMethod | null {
  if (p.forma === 'PIX') return p.pago ? 'ONLINE_PIX' : null;
  if (p.forma === 'CREDITO') return p.pago ? 'ONLINE_CARD' : 'CREDIT_ON_DELIVERY';
  if (p.forma === 'DEBITO') return p.pago ? 'ONLINE_CARD' : 'DEBIT_ON_DELIVERY';
  if (p.forma === 'DINHEIRO') return 'CASH';
  if (p.forma === 'VALE_REFEICAO') return 'VOUCHER_ON_DELIVERY';
  return null;
}

const FORM_LABEL: Record<OrderApiInput['pagamento']['forma'], string> = {
  PIX: 'PIX', CREDITO: 'cartão de crédito', DEBITO: 'cartão de débito', DINHEIRO: 'dinheiro', VALE_REFEICAO: 'vale-refeição', OUTRO: 'outra forma',
};

/** What the kitchen and the delivery person read on the ticket */
export function kitchenNote(input: OrderApiInput): string {
  const p = input.pagamento;
  const change = p.forma === 'DINHEIRO' && p.trocoPara ? ` — troco para ${brl(p.trocoPara)} (levar ${brl(Math.round((p.trocoPara - input.total) * 100) / 100)})` : '';
  const e = input.entrega;
  return [
    input.retirada ? 'RETIRADA NO LOCAL' : `Entrega: ${[e?.endereco, e?.numero].filter(Boolean).join(', ')}${e?.complemento ? ` - ${e.complemento}` : ''}`,
    !input.retirada && e?.bairro ? `Bairro: ${e.bairro}` : '',
    !input.retirada && e?.referencia ? `Referência: ${e.referencia}` : '',
    input.agendadoPara ? `AGENDADO PARA ${input.agendadoPara.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '',
    p.pago ? `Pagamento: ${FORM_LABEL[p.forma]} (já pago)` : `Pagamento na ${input.retirada ? 'retirada' : 'entrega'}: ${FORM_LABEL[p.forma]}${change}`,
    // Never a line of its own: a note reading "Pagamento: PIX (já pago)" must not pass for the payment line (final review 2026-10-24)
    sanitizeCustomerNote(input.observacao),
    `Cliente: ${input.cliente.nome} - ${formatPhone(input.cliente.celular)}`,
  ].filter(Boolean).join('\n');
}

async function customerFor(restaurantId: string, input: OrderApiInput) {
  const digits = input.cliente.celular;
  const found = await findCustomerByPhone(prisma, restaurantId, digits);
  if (found) return found.id;
  // The e-mail is unique across Gastrux: saved only when nobody has it yet
  const email = input.cliente.email && !(await prisma.customer.findUnique({ where: { email: input.cliente.email } })) ? input.cliente.email : null;
  try {
    const created = await prisma.customer.create({
      data: {
        restaurantId, name: input.cliente.nome, phone: formatPhone(digits), phoneDigits: digits, email,
        address: input.entrega?.endereco ?? '', city: input.entrega?.cidade ?? '', zipCode: input.entrega?.cep ?? '',
      },
      select: { id: true },
    });
    return created.id;
  } catch (e: any) {
    // The same customer's two orders at once: the other one created the row
    if (e?.code !== 'P2002') throw e;
    return (await findCustomerByPhone(prisma, restaurantId, digits))?.id ?? null;
  }
}

async function kitchenOrderOf(externalOrderId: string): Promise<string | null> {
  return (await prisma.order.findUnique({ where: { externalOrderId }, select: { id: true } }))?.id ?? null;
}

/**
 * The answer to an order sent again (final review 2026-10-24): the code must be of this same integration (two senders
 * numbering their orders the same way must not swallow each other's orders), and an accepted order whose kitchen order
 * failed gets it now, so a resend recovers it.
 */
async function answerResend(existing: ExternalOrder, restaurantId: string, integrationId: string) {
  if (existing.integrationId !== integrationId) throw new DeliveryOrderError('Este código já é de outro pedido do restaurante: mande um código diferente', 409);
  let kitchenOrderId = await kitchenOrderOf(existing.id);
  if (!kitchenOrderId && existing.status === 'CONFIRMED') kitchenOrderId = (await acceptDeliveryOrder(restaurantId, existing.id, {})).kitchenOrderId;
  return { externalOrder: existing, kitchenOrderId, duplicate: true };
}

export async function ingestDeliveryOrder(args: {
  restaurantId: string;
  integrationId: string;
  apiKeyId?: string;
  platform: DeliveryPlatform;
  input: OrderApiInput;
}): Promise<{ externalOrder: ExternalOrder; kitchenOrderId: string | null; duplicate: boolean }> {
  const { restaurantId, integrationId, input } = args;
  const key = { restaurantId_externalOrderId: { restaurantId, externalOrderId: input.codigo } };
  const existing = await prisma.externalOrder.findUnique({ where: key });
  if (existing) return answerResend(existing, restaurantId, integrationId);

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { deliveryAutoAccept: true } });
  const customerId = OWN_CUSTOMERS.includes(args.platform) ? await customerFor(restaurantId, input) : null;
  const subtotal = input.itens.reduce((sum, it) => sum + (it.precoUnitario + (it.adicionais ?? []).reduce((a, ad) => a + ad.preco, 0)) * it.quantidade, 0);
  let externalOrder: ExternalOrder;
  try {
    externalOrder = await prisma.externalOrder.create({
      data: {
        restaurantId, integrationId, apiKeyId: args.apiKeyId, externalOrderId: input.codigo, status: 'PENDING',
        totalAmount: input.total, subtotal: Math.round(subtotal * 100) / 100, deliveryFee: input.taxaEntrega, discount: input.desconto, platformFee: 0,
        paymentMethod: paymentMethodOf(input.pagamento), paidOnline: input.pagamento.pago, scheduledFor: input.agendadoPara,
        customerId, customerName: input.cliente.nome, customerPhone: formatPhone(input.cliente.celular), customerEmail: input.cliente.email,
        deliveryAddress: input.retirada ? 'Retirada no local' : [input.entrega?.endereco, input.entrega?.numero].filter(Boolean).join(', '),
        deliveryCity: input.entrega?.cidade, deliveryZipcode: input.entrega?.cep,
        items: JSON.stringify(input.itens.map((it) => ({
          externalItemId: it.codigo, name: it.nome, quantity: it.quantidade, price: it.precoUnitario,
          specialInstructions: [...(it.adicionais ?? []).map((ad) => `+ ${ad.nome}`), sanitizeCustomerNote(it.observacao)].filter(Boolean).join(' · ') || undefined,
        }))),
        specialInstructions: kitchenNote(input),
      },
    });
  } catch (e: any) {
    // A simultaneous send of the same order won the insert: its row is the answer
    if (e?.code !== 'P2002') throw e;
    const winner = await prisma.externalOrder.findUnique({ where: key });
    if (!winner) throw e;
    return answerResend(winner, restaurantId, integrationId);
  }

  if (restaurant?.deliveryAutoAccept !== false) {
    const { kitchenOrderId } = await acceptDeliveryOrder(restaurantId, externalOrder.id, {});
    const fresh = await prisma.externalOrder.findUnique({ where: { id: externalOrder.id } });
    return { externalOrder: fresh ?? externalOrder, kitchenOrderId, duplicate: false };
  }
  await prisma.notification.create({
    data: {
      restaurantId, type: 'SYSTEM_INFO', severity: 'HIGH',
      title: 'Novo pedido de delivery',
      message: `Pedido ${input.codigo} de ${input.cliente.nome}, ${brl(input.total)}: aceite em Pedidos de delivery.`,
      actionUrl: '/admin/integrations/orders', actionLabel: 'Ver pedido',
      data: { kind: 'delivery_order_waiting', externalOrderId: externalOrder.id, dedupeKey: `delivery-waiting:${externalOrder.id}` },
    },
  }).catch((err) => console.error('[delivery-orders] waiting alert failed:', err));
  return { externalOrder, kitchenOrderId: null, duplicate: false };
}

export async function acceptDeliveryOrder(restaurantId: string, externalOrderId: string, _by: { userId?: string }): Promise<{ kitchenOrderId: string | null }> {
  const moved = await prisma.externalOrder.updateMany({ where: { id: externalOrderId, restaurantId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
  const order = await prisma.externalOrder.findFirst({ where: { id: externalOrderId, restaurantId }, select: { id: true, status: true } });
  if (!order) throw new DeliveryOrderError('Pedido não encontrado', 404);
  if (order.status === 'CANCELLED' || order.status === 'REJECTED') throw new DeliveryOrderError('Este pedido foi cancelado', 409);
  let kitchenOrderId = await kitchenOrderOf(order.id);
  if (!kitchenOrderId) {
    // A simultaneous accept that created it first makes this one fail on the unique externalOrderId (returns null)
    kitchenOrderId = (await createOrderFromExternalOrder(order.id))?.id ?? (await kitchenOrderOf(order.id));
    if (kitchenOrderId) await noteSalesThresholds(restaurantId).catch(() => {});
  }
  // The sender hears "aceito" (never waits on its address)
  if (moved.count > 0) void notifyOrderStatus(order.id);
  return { kitchenOrderId };
}

export async function rejectDeliveryOrder(member: RestaurantMember, externalOrderId: string, reason: unknown): Promise<void> {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 3 || why.length > 200) throw new DeliveryOrderError('Diga o motivo da recusa (de 3 a 200 letras)');
  const moved = await prisma.externalOrder.updateMany({ where: { id: externalOrderId, restaurantId: member.restaurantId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (moved.count === 0) {
    const exists = await prisma.externalOrder.count({ where: { id: externalOrderId, restaurantId: member.restaurantId } });
    throw exists ? new DeliveryOrderError('Este pedido já foi aceito ou cancelado', 409) : new DeliveryOrderError('Pedido não encontrado', 404);
  }
  await recordAudit(member, { action: 'UPDATE', entityType: 'ExternalOrder', entityId: externalOrderId, changes: { status: 'CANCELLED', reason: why } });
  void notifyOrderStatus(externalOrderId);
}
