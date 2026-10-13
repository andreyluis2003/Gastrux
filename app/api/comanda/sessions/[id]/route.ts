// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { settleSessionStock } from '@/lib/stock/session-stock';
import { idempotent } from '@/lib/api/idempotency';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { noteSalesThresholds } from '@/lib/plans/monthly-sales';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError, settlePayments } from '@/lib/caixa/rules';
import { comandaTotalCents, readPayments, recordSaleEntries, resolveSaleShift, reverseSaleEntries, type SaleTarget } from '@/lib/caixa/sale';
import { toNfcePaymentMethod } from '@/lib/caixa/payment-methods';
import { alertLateEntry, alertSaleWithoutShift } from '@/lib/caixa/alerts';
import { billTotals, serviceApplies } from '@/lib/comanda/bill';
import { billHasPayments, billPaidCents } from '@/lib/comanda/bill-service';
import { lockComanda } from '@/lib/comanda/add-item';
import { OPEN_STATUSES as KITCHEN_OPEN_STATUSES } from '@/lib/kds/order-status';

export const dynamic = 'force-dynamic';

// GET /api/comanda/sessions/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    const orderSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        user: { select: { name: true } },
        table: { include: { section: { select: { name: true } } } },
        items: {
          include: {
            recipe: { select: { name: true, sellingPrice: true } },
            modifiers: { include: { modifier: { select: { name: true } } } },
          },
          // In the order they were added: an edit must not move a line on the waiter's screen
          orderBy: { addedAt: 'asc' },
        },
        order: { select: { orderNumber: true, status: true } },
      },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(orderSession);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT /api/comanda/sessions/[id]
async function handlePUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    const ownedSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true, status: true, tableId: true },
    });
    if (!ownedSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const { notes, customerName, status, customerCPF } = body ?? {};
    // A sale made offline and replayed by the device queue carries the time it was made. Older devices
    // send the legacy one-method body: for them the Idempotency-Key of their queue marks a replay (spec §6.1)
    const legacyBody = !Array.isArray(body?.payments) && Boolean(body?.paymentMethod);
    const replay = Boolean(body?.queuedAt) || (legacyBody && Boolean(request.headers.get('idempotency-key')));
    if (legacyBody && status === 'CLOSED') {
      // Logged so the compatibility can be removed once no device sends it (spec §6.1)
      console.warn('[caixa] legacy one-method close body', { restaurantId, orderSessionId: params.id });
    }

    // A cancelled comanda stays cancelled; a closed one is only closed once (the note is issued once)
    if (status !== undefined && ownedSession.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Comanda cancelada não pode mudar de status' }, { status: 409 });
    }
    // Cancelling goes through DELETE (manager + reason + trace), never through a status update
    if (status === 'CANCELLED') {
      return NextResponse.json({ error: 'Para cancelar a comanda use o cancelamento (exige gerente e motivo)' }, { status: 400 });
    }

    // Paying a bill that is already closed (a stale tab, another device): never "closed" again, since
    // nothing would be received. The legacy body without payments keeps answering 200 (older devices)
    if (status === 'CLOSED' && ownedSession.status === 'CLOSED' && Array.isArray(body?.payments)) {
      // 422, not 409: the device outbox retries 409 forever, and this refusal is final
      return NextResponse.json({ error: 'Esta conta já foi fechada', code: 'ALREADY_CLOSED' }, { status: 422 });
    }

    const reopening = status !== undefined && status !== 'CLOSED' && ownedSession.status === 'CLOSED';
    const closing = status === 'CLOSED' && ownedSession.status !== 'CLOSED';
    let member: RestaurantMember | null = null;

    // Reopening a closed bill (its note may be issued) is a manager decision, and it is recorded
    if (reopening) {
      const auth = await requireRestaurantRole(MANAGER_ROLES, 'Reabrir uma conta fechada exige um gerente');
      if (!auth.ok) return auth.response;
      member = auth.member;
    }
    // Receiving the payment is the cashier's job (spec docs/superpowers/specs/2026-10-04-caixa-turnos-design.md §6.1)
    if (closing) {
      const auth = await requireRestaurantRole(CASHIER_PLUS, 'Fechar a conta exige o caixa');
      if (!auth.ok) return auth.response;
      member = auth.member;
    }

    let saleTarget: SaleTarget | null = null;
    let primaryMethod: string | undefined;
    let changeCents = 0;
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        if (closing) {
          // Same lock as the bill screen's payments: a partial payment and this close never both count
          await lockComanda(tx, params.id);
          const read = readPayments(body);
          if (!read) throw new CashRuleError('Informe as formas de pagamento');
          // The bill screen pays in parts (POST .../payments); an old close from a device queue must
          // never charge the whole total again over those parts (spec 2026-10-07, 4.3). Net paid, so a
          // bill reopened by a manager (its money already given back) can still be closed here
          // Online payments of the table (pay at the table) count too
          if (await billHasPayments(tx, restaurantId, params.id)) throw new CashRuleError('Esta conta já tem pagamentos: feche pela tela Conta', 422, 'PARTIAL_PAYMENTS');
          const itemsTotal = await comandaTotalCents(tx, params.id);
          const bill = await tx.orderSession.findUnique({
            where: { id: params.id },
            select: { serviceChargeEligible: true, restaurant: { select: { serviceChargePercent: true } } },
          });
          const { serviceCents } = billTotals(itemsTotal, bill?.restaurant.serviceChargePercent ?? 0, {
            applies: serviceApplies(bill ?? {}),
            waived: body?.serviceCharge !== true,
          });
          const total = itemsTotal + serviceCents;
          // Legacy body (one paymentMethod, older devices): the whole total in that method
          const payments = read.legacy ? [{ method: read.payments[0].method, amount: (total / 100).toFixed(2) }] : read.payments;
          const settled = settlePayments(total, payments);
          saleTarget = await resolveSaleShift(tx, { restaurantId, cashSessionId: body?.cashSessionId, replay, legacy: read.legacy });
          // Only one close writes: a second device sees the comanda already closed
          const guard = await tx.orderSession.updateMany({
            where: { id: params.id, status: { not: 'CLOSED' } },
            // Paid: the table's "pagar com o garçom" was answered (spec 2026-10-10 §5.3)
            data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: serviceCents, payAtWaiterRequestedAt: null },
          });
          if (guard.count === 0) throw new CashRuleError('Esta conta já foi fechada', 422, 'ALREADY_CLOSED');
          // The sale takes its ingredients out of stock, kitchen screen or not (lib/stock/session-stock.ts)
          await settleSessionStock(tx, restaurantId, params.id);
          if (saleTarget) await recordSaleEntries(tx, { restaurantId, target: saleTarget, orderSessionId: params.id, settled, createdById: member!.userId });
          primaryMethod = toNfcePaymentMethod(settled.primaryMethod);
          changeCents = settled.changeCents;
        }
        if (reopening) {
          const reason = String(body?.reason ?? '').trim();
          if (reason.length < 3) throw new CashRuleError('Informe o motivo da reabertura');
          // The table was freed when this bill closed and may have a new comanda now: reopening this one would
          // leave two open bills on one table (2026-10-12). Under the lock a tap on the table takes to open one.
          if (ownedSession.tableId) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-table:' + ownedSession.tableId}))`;
            const other = await tx.orderSession.findFirst({
              where: { tableId: ownedSession.tableId, restaurantId, id: { not: params.id }, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } },
              select: { id: true, table: { select: { number: true } } },
            });
            if (other) throw new CashRuleError(`A Mesa ${other.table?.number ?? ''} já tem outra comanda aberta. Feche ou transfira aquela comanda antes de reabrir esta.`, 409, 'TABLE_BUSY');
          }
          // Only one reopen writes: two requests at once must not give the money back twice
          // A reopened bill starts with no waiter call: an old one must not come back as if new
          const guard = await tx.orderSession.updateMany({ where: { id: params.id, status: 'CLOSED' }, data: { status, payAtWaiterRequestedAt: null } });
          if (guard.count === 0) throw new CashRuleError('Esta conta já foi reaberta', 422, 'ALREADY_REOPENED');
          // The money of this bill leaves the drawer until it is closed again (a bill closed without
          // cash lines, before the cash register or with no shift, reopens without one)
          const paid = await tx.cashSessionEntry.count({ where: { orderSessionId: params.id, restaurantId } });
          if (paid > 0) {
            await reverseSaleEntries(tx, { restaurantId, orderSessionId: params.id, cashSessionId: String(body?.cashSessionId ?? ''), createdById: member!.userId, reason });
          }
        }
        return tx.orderSession.update({
          where: { id: params.id },
          data: {
            notes: notes !== undefined ? notes : undefined,
            customerName: customerName !== undefined ? customerName : undefined,
            ...(status !== undefined && !closing ? { status } : {}),
          },
          include: {
            items: { include: { recipe: { select: { name: true, sellingPrice: true } } } },
          },
        });
      });
    } catch (error) {
      if (error instanceof CashRuleError) {
        return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
      }
      throw error;
    }

    if (reopening) {
      await recordAudit(member!, {
        action: 'STATUS_CHANGE',
        entityType: 'OrderSession',
        entityId: params.id,
        changes: { from: 'CLOSED', to: status, reason: body?.reason },
      });
    }

    if (closing) {
      const target = saleTarget as SaleTarget | null;
      if (target?.late) await alertLateEntry(restaurantId, target.cashSessionId, params.id);
      if (!target) await alertSaleWithoutShift(restaurantId, params.id);
      // A sale of the month: the plan warns at 80% / 100% and never blocks (2026-10-09)
      await noteSalesThresholds(restaurantId);
      // Closing the bill issues the NFC-e when the restaurant enabled it (NFeConfig.autoIssueOnSale).
      // Never fails the close: a problem comes back as a message and leaves an alert for the manager.
      const nfce = await autoEmitNFCe({
        restaurantId,
        orderSessionId: params.id,
        customerCPF,
        customerName: customerName || updated.customerName,
        paymentMethod: primaryMethod,
        onlyIfEnabled: true,
      });
      return NextResponse.json({ ...updated, changeCents, nfce });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE /api/comanda/sessions/[id] - cancel the whole comanda.
// Market practice: a manager of this restaurant, with a reason, and it leaves a trace.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRestaurantRole(MANAGER_ROLES, 'Cancelar uma comanda exige um gerente');
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 3) {
      return NextResponse.json({ error: 'Informe o motivo do cancelamento' }, { status: 400 });
    }

    const ownedSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId: member.restaurantId },
      include: { items: { select: { recipeId: true, quantity: true, price: true } } },
    });
    if (!ownedSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (ownedSession.status === 'CANCELLED') return NextResponse.json({ success: true, alreadyCancelled: true });

    try {
      await prisma.$transaction(async (tx) => {
        // A paid bill (closed, or with partial payments) gives its money back in the open shift of this
        // device before it is cancelled. Only one cancel writes: two requests at once must not give the
        // money back twice
        await lockComanda(tx, params.id);
        // The kitchen would keep cooking a cancelled comanda (2026-10-12): its open orders are cancelled
        // first (KDS, or the sent items one by one, which record the loss). Served orders do not block.
        const cooking = await tx.order.count({ where: { orderSessionId: params.id, status: { in: KITCHEN_OPEN_STATUSES as any } } });
        if (cooking) throw new CashRuleError('A cozinha ainda tem pedidos desta comanda. Cancele esses pedidos na cozinha (ou os itens enviados) antes de cancelar a comanda.', 409, 'KITCHEN_OPEN');
        const guard = await tx.orderSession.updateMany({ where: { id: params.id, status: ownedSession.status }, data: { status: 'CANCELLED' } });
        if (guard.count === 0) throw new CashRuleError('Esta comanda mudou enquanto era cancelada. Atualize e tente de novo.', 422, 'CHANGED');
        // A closed sale that is cancelled gives back the stock its close took (lib/stock/session-stock.ts)
        await settleSessionStock(tx, member.restaurantId, params.id);
        // Online money (pay at the table) cannot be given back from the drawer: it is refunded through
        // Mercado Pago first, so the cancel is refused (and rolled back) while the bill still holds it
        const { cashCents, onlineCents } = await billPaidCents(tx, member.restaurantId, params.id);
        if (onlineCents > 0) throw new CashRuleError('Pagamento online: estorne pelo Mercado Pago antes de cancelar', 409, 'ONLINE_PAYMENTS');
        if (cashCents > 0) {
          await reverseSaleEntries(tx, { restaurantId: member.restaurantId, orderSessionId: params.id, cashSessionId: String(body?.cashSessionId ?? ''), createdById: member.userId, reason, kind: 'cancel' });
        }
      });
    } catch (error) {
      if (error instanceof CashRuleError) {
        return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
      }
      throw error;
    }

    await recordAudit(member, {
      action: 'STATUS_CHANGE',
      entityType: 'OrderSession',
      entityId: params.id,
      changes: { from: ownedSession.status, to: 'CANCELLED', reason, items: ownedSession.items },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const PUT = idempotent(handlePUT);
