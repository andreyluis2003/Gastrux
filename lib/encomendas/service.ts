import { prisma } from '@/lib/prisma';
import { lockComanda } from '@/lib/comanda/add-item';
import { emitClosedBill, loadBill } from '@/lib/comanda/bill-service';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { settleSessionStock } from '@/lib/stock/session-stock';
import { onBillClosed } from '@/lib/cashback/bill';
import { normalizePhone } from '@/lib/cashback/rules';
import { findCustomerByPhone, upsertCustomerByPhone } from '@/lib/cashback/service';

/**
 * Encomendas (spec docs/superpowers/specs/2026-10-26-encomendas-design.md): a comanda with status
 * ENCOMENDA and a pickup time. Off the salão (its lists read OPEN, SENT_TO_KITCHEN and READY), it takes a
 * deposit in Conta without closing and becomes a sale at the pickup.
 */

// A pickup a little in the past is fine (typed late at the counter); days ago is a typo
const PAST_TOLERANCE_MS = 12 * 3600_000;

export interface NewEncomenda {
  customerName?: unknown;
  customerPhone?: unknown;
  pickupAt?: unknown;
  notes?: unknown;
}

export async function createEncomenda(member: RestaurantMember, input: NewEncomenda) {
  const customerName = typeof input.customerName === 'string' ? input.customerName.trim().slice(0, 80) : '';
  if (!customerName) throw new CashRuleError('Informe o nome do cliente', 400);
  const pickupAt = typeof input.pickupAt === 'string' ? new Date(input.pickupAt) : null;
  if (!pickupAt || Number.isNaN(pickupAt.getTime())) throw new CashRuleError('Informe a data e a hora da retirada', 400);
  if (pickupAt.getTime() < Date.now() - PAST_TOLERANCE_MS) throw new CashRuleError('A data da retirada já passou', 400);
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 500) : null;
  const phone = normalizePhone(input.customerPhone);

  return prisma.$transaction(async (tx) => {
    // The phone puts the customer in the CRM and the cashback, as at the counter
    const customer = phone
      ? (await findCustomerByPhone(tx, member.restaurantId, phone)) ?? (await upsertCustomerByPhone(tx, member.restaurantId, phone, customerName))
      : null;
    const created = await tx.orderSession.create({
      data: {
        restaurantId: member.restaurantId,
        userId: member.userId,
        status: 'ENCOMENDA',
        customerName,
        customerId: customer?.id ?? null,
        pickupAt,
        notes,
        serviceChargeEligible: false,
      },
      select: { id: true },
    });
    await recordAudit(member, { action: 'CREATE', entityType: 'OrderSession', entityId: created.id, changes: { encomenda: true, pickupAt: pickupAt.toISOString() } });
    return created;
  });
}

export interface EncomendaView {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupAt: string | null;
  notes: string | null;
  items: Array<{ name: string; quantity: number; weightGrams: number | null }>;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}

/** The encomendas not picked up yet, by pickup time */
export async function listEncomendas(restaurantId: string): Promise<EncomendaView[]> {
  const rows = await prisma.orderSession.findMany({
    where: { restaurantId, status: 'ENCOMENDA' },
    select: {
      id: true, customerName: true, pickupAt: true, notes: true,
      customer: { select: { phone: true } },
      items: { select: { quantity: true, weightGrams: true, recipe: { select: { name: true } } }, orderBy: { addedAt: 'asc' } },
    },
    orderBy: [{ pickupAt: 'asc' }, { openedAt: 'asc' }],
    take: 300,
  });
  const views: EncomendaView[] = [];
  for (const r of rows) {
    const bill = await loadBill(prisma, restaurantId, r.id);
    views.push({
      id: r.id,
      customerName: r.customerName,
      customerPhone: r.customer?.phone ?? null,
      pickupAt: r.pickupAt?.toISOString() ?? null,
      notes: r.notes,
      items: r.items.map((i) => ({ name: i.recipe?.name ?? 'Item', quantity: i.quantity, weightGrams: i.weightGrams })),
      totalCents: bill?.totalCents ?? 0,
      paidCents: bill?.paidCents ?? 0,
      remainingCents: bill?.remainingCents ?? 0,
    });
  }
  return views;
}

/**
 * "Cliente retirou": the encomenda becomes a sale now. Its lines count from now (reports, daily count);
 * paid in full it closes at once (stock, cashback, NFC-e), else it is an open comanda to take the rest.
 */
export async function pickUpEncomenda(member: RestaurantMember, sessionId: string): Promise<{ status: 'OPEN' | 'CLOSED' }> {
  const result = await prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const s = await tx.orderSession.findFirst({
      where: { id: sessionId, restaurantId: member.restaurantId },
      select: { status: true, customerName: true, _count: { select: { items: true } } },
    });
    if (!s) throw new CashRuleError('Encomenda não encontrada', 404);
    if (s.status !== 'ENCOMENDA') throw new CashRuleError('Esta encomenda já foi retirada ou cancelada', 409);
    if (s._count.items === 0) throw new CashRuleError('A encomenda não tem itens', 400);
    const now = new Date();
    await tx.orderSessionItem.updateMany({ where: { sessionId }, data: { addedAt: now } });
    await tx.orderSession.update({ where: { id: sessionId }, data: { status: 'OPEN' } });
    const bill = (await loadBill(tx, member.restaurantId, sessionId))!;
    let closed = false;
    if (bill.totalCents > 0 && bill.remainingCents === 0) {
      await tx.orderSession.update({ where: { id: sessionId }, data: { status: 'CLOSED', closedAt: now, serviceChargeCents: bill.serviceCents } });
      await settleSessionStock(tx, member.restaurantId, sessionId);
      await onBillClosed(tx, member.restaurantId, sessionId);
      closed = true;
    }
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sessionId, changes: { encomenda: 'retirada', closed } });
    return { closed, customerName: s.customerName };
  });
  if (result.closed) await emitClosedBill(member, sessionId, null, result.customerName);
  return { status: result.closed ? 'CLOSED' : 'OPEN' };
}
