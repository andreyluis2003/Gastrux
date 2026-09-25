import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { addComandaItem, AddItemError, type AddItemInput } from '@/lib/comanda/add-item';
import { sendSessionToKitchen } from '@/lib/kds/send-session';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';

export const dynamic = 'force-dynamic';

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * POST /api/comanda/quick-sale - a counter sale ("venda balcão") in ONE request, so a device can
 * make it offline and send it later (the offline queue replays it with the same Idempotency-Key).
 * Body: { clientId, items: [{ menuItemId?, recipeId?, quantity?, modifierIds? }], customerCPF?,
 *         customerName?, paymentMethod?, sendToKitchen? }
 * The device chooses the comanda id (clientId), so a replay finds the sale it already made. Prices
 * come from the menu. The sale is closed at once; the NFC-e is issued as on any close
 * (NFeConfig.autoIssueOnSale), and a fiscal problem never fails the sale.
 */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const body = await request.json().catch(() => ({}));
  const { clientId, customerCPF, customerName, paymentMethod } = body ?? {};
  const items: AddItemInput[] = Array.isArray(body?.items) ? body.items : [];
  if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) {
    return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: 'Venda sem itens' }, { status: 400 });
  }

  const existing = await prisma.orderSession.findUnique({ where: { id: clientId } });
  if (existing) {
    if (existing.restaurantId !== member.restaurantId) {
      return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
    }
    return NextResponse.json({ session: existing, alreadyRecorded: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderSession.create({
        data: { id: clientId, restaurantId: member.restaurantId, userId: member.userId, status: 'OPEN', customerName: customerName || 'Balcão' },
      });
      for (const item of items) {
        await addComandaItem(tx, member.restaurantId, clientId, item);
      }
    });
  } catch (error) {
    if (error instanceof AddItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

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
    paymentMethod,
    onlyIfEnabled: true,
  });

  return NextResponse.json({ session, kitchen, nfce }, { status: 201 });
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
