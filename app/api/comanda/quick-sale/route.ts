import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { addComandaItem, AddItemError, type AddItemInput } from '@/lib/comanda/add-item';
import { sendSessionToKitchen } from '@/lib/kds/send-session';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { CashRuleError, settlePayments } from '@/lib/caixa/rules';
import { comandaTotalCents, readPayments, recordSaleEntries, resolveSaleShift, type SaleTarget } from '@/lib/caixa/sale';
import { toNfcePaymentMethod } from '@/lib/caixa/payment-methods';
import { alertLateEntry, alertSaleWithoutShift } from '@/lib/caixa/alerts';

export const dynamic = 'force-dynamic';

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * POST /api/comanda/quick-sale - a counter sale ("venda balcão") in ONE request, so a device can
 * make it offline and send it later (the offline queue replays it with the same Idempotency-Key).
 * Body: { clientId, items: [{ menuItemId?, recipeId?, quantity?, modifierIds? }], customerCPF?,
 *         customerName?, sendToKitchen?, cashSessionId, payments: [{ method, amount }], queuedAt? }
 *         (legacy: paymentMethod instead of payments, paid in full in the default register shift)
 * The device chooses the comanda id (clientId), so a replay finds the sale it already made. Prices
 * come from the menu. The sale is paid and closed at once: its payments and change enter the cash
 * shift (docs/superpowers/specs/2026-10-04-caixa-turnos-design.md §6.2); without an open shift the
 * whole sale is refused. The NFC-e is issued as on any close (NFeConfig.autoIssueOnSale), and a
 * fiscal problem never fails the sale.
 */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const body = await request.json().catch(() => ({}));
  const { clientId, customerCPF, customerName } = body ?? {};
  const items: AddItemInput[] = Array.isArray(body?.items) ? body.items : [];
  if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) {
    return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: 'Venda sem itens' }, { status: 400 });
  }

  const existing = await prisma.orderSession.findUnique({ where: { id: clientId } });
  if (!existing) {
    // A counter sale is a transaction of the plan, like a comanda sent to the kitchen
    const { enforceResourceLimit } = await import('@/lib/api/tier-middleware');
    const tierBlock = await enforceResourceLimit(member.restaurantId, 'dailyTransactions');
    if (tierBlock) return tierBlock;
  }
  if (existing) {
    if (existing.restaurantId !== member.restaurantId) {
      return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
    }
    return NextResponse.json({ session: existing, alreadyRecorded: true });
  }

  const read = readPayments(body);
  if (!read) return NextResponse.json({ error: 'Informe as formas de pagamento' }, { status: 400 });
  // A sale made offline and replayed by the device queue carries the time it was made
  const replay = Boolean(body?.queuedAt);
  let target: SaleTarget | null = null;
  let changeCents = 0;
  let primaryMethod: string | undefined;

  try {
    // All or nothing: the comanda, its lines and its cash entries
    await prisma.$transaction(async (tx) => {
      target = await resolveSaleShift(tx, { restaurantId: member.restaurantId, cashSessionId: body?.cashSessionId, replay, legacy: read.legacy });
      await tx.orderSession.create({
        data: { id: clientId, restaurantId: member.restaurantId, userId: member.userId, status: 'OPEN', customerName: customerName || 'Balcão' },
      });
      for (const item of items) {
        await addComandaItem(tx, member.restaurantId, clientId, item);
      }
      const total = await comandaTotalCents(tx, clientId);
      const payments = read.legacy ? [{ method: read.payments[0].method, amount: (total / 100).toFixed(2) }] : read.payments;
      const settled = settlePayments(total, payments);
      if (target) {
        await recordSaleEntries(tx, { restaurantId: member.restaurantId, target, orderSessionId: clientId, settled, createdById: member.userId });
      }
      changeCents = settled.changeCents;
      primaryMethod = toNfcePaymentMethod(settled.primaryMethod);
    });
  } catch (error) {
    if (error instanceof AddItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CashRuleError) {
      return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    }
    throw error;
  }

  const shift = target as SaleTarget | null;
  if (shift?.late) await alertLateEntry(member.restaurantId, shift.cashSessionId, clientId);
  if (!shift) await alertSaleWithoutShift(member.restaurantId, clientId);

  let kitchen: unknown = null;
  if (body?.sendToKitchen) {
    const sent = await sendSessionToKitchen(member.restaurantId, clientId);
    kitchen = await sent.json().catch(() => null);
  }

  const session = await prisma.orderSession.update({
    where: { id: clientId },
    data: { status: 'CLOSED', closedAt: new Date() },
    include: { items: { include: { recipe: { select: { name: true } }, modifiers: true } } },
  });
  const nfce = await autoEmitNFCe({
    restaurantId: member.restaurantId,
    orderSessionId: clientId,
    customerCPF,
    customerName,
    paymentMethod: primaryMethod,
    onlyIfEnabled: true,
  });

  return NextResponse.json({ session, kitchen, nfce, changeCents }, { status: 201 });
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
