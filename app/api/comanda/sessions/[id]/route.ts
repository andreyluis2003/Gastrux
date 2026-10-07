// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError, settlePayments } from '@/lib/caixa/rules';
import { comandaTotalCents, readPayments, recordSaleEntries, resolveSaleShift, reverseSaleEntries, type SaleTarget } from '@/lib/caixa/sale';
import { toNfcePaymentMethod } from '@/lib/caixa/payment-methods';
import { alertLateEntry, alertSaleWithoutShift } from '@/lib/caixa/alerts';

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
      select: { id: true, status: true },
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
          const read = readPayments(body);
          if (!read) throw new CashRuleError('Informe as formas de pagamento');
          const total = await comandaTotalCents(tx, params.id);
          // Legacy body (one paymentMethod, older devices): the whole total in that method
          const payments = read.legacy ? [{ method: read.payments[0].method, amount: (total / 100).toFixed(2) }] : read.payments;
          const settled = settlePayments(total, payments);
          saleTarget = await resolveSaleShift(tx, { restaurantId, cashSessionId: body?.cashSessionId, replay, legacy: read.legacy });
          // Only one close writes: a second device sees the comanda already closed
          const guard = await tx.orderSession.updateMany({
            where: { id: params.id, status: { not: 'CLOSED' } },
            data: { status: 'CLOSED', closedAt: new Date() },
          });
          if (guard.count === 0) throw new CashRuleError('Esta conta já foi fechada', 422, 'ALREADY_CLOSED');
          if (saleTarget) await recordSaleEntries(tx, { restaurantId, target: saleTarget, orderSessionId: params.id, settled, createdById: member!.userId });
          primaryMethod = toNfcePaymentMethod(settled.primaryMethod);
          changeCents = settled.changeCents;
        }
        if (reopening) {
          const reason = String(body?.reason ?? '').trim();
          if (reason.length < 3) throw new CashRuleError('Informe o motivo da reabertura');
          // Only one reopen writes: two requests at once must not give the money back twice
          const guard = await tx.orderSession.updateMany({ where: { id: params.id, status: 'CLOSED' }, data: { status } });
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
        // A paid bill gives its money back in the open shift of this device before it is cancelled
        // Only one cancel writes: two requests at once must not give the money back twice
        const guard = await tx.orderSession.updateMany({ where: { id: params.id, status: ownedSession.status }, data: { status: 'CANCELLED' } });
        if (guard.count === 0) throw new CashRuleError('Esta comanda mudou enquanto era cancelada. Atualize e tente de novo.', 422, 'CHANGED');
        const paid = ownedSession.status === 'CLOSED'
          && (await tx.cashSessionEntry.count({ where: { orderSessionId: params.id, restaurantId: member.restaurantId } })) > 0;
        if (paid) {
          await reverseSaleEntries(tx, { restaurantId: member.restaurantId, orderSessionId: params.id, cashSessionId: String(body?.cashSessionId ?? ''), createdById: member.userId, reason });
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
