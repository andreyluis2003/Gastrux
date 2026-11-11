import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { KITCHEN_VISIBLE_ORDER_WHERE } from '@/lib/kds-visibility';
import { releaseDue } from '@/lib/weekly-menu/release';

/**
 * Todos os pedidos (spec 2026-11-07 quadro-de-pedidos §B): every open order of every channel in one board, read
 * only. Kitchen orders not finished in the last 24 h, plus delivery orders waiting for "Aceitar" or out for
 * delivery. A card links to the screen where it is handled.
 */
import { CHANNEL_LABEL, platformChannel, sessionChannel, type BoardCard, type Channel, type Stage } from './board-shared';
export * from './board-shared';

const WINDOW_MS = 24 * 3600_000;
const cents = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));

/** The number the platform shows: iFood displayId, 99Food #orderIndex; else the end of the platform id */
const extNumber = (e: { externalOrderId: string; platformData: unknown }) => {
  const d = e.platformData as { displayId?: string; orderIndex?: number | string } | null;
  const shown = d?.displayId || d?.orderIndex;
  return shown ? `#${shown}` : `#${e.externalOrderId.slice(-6)}`;
};

export async function loadBoard(restaurantId: string, now = new Date()): Promise<BoardCard[]> {
  // Due pre-orders enter before the read (spec 2026-11-10 cardapio-da-semana); a failure never breaks the board
  try {
    await releaseDue(restaurantId, now);
  } catch (e: any) {
    console.error('[weekly-menu] release on board load failed:', e?.message ?? e);
  }
  const since = new Date(now.getTime() - WINDOW_MS);
  const [orders, externals] = await Promise.all([
    prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'PREPARING', 'READY', 'ON_HOLD'] },
        createdAt: { gte: since },
        AND: [KITCHEN_VISIBLE_ORDER_WHERE as unknown as Prisma.OrderWhereInput],
      },
      select: {
        id: true, orderNumber: true, status: true, total: true, createdAt: true, totalItems: true,
        _count: { select: { items: true } },
        externalOrder: { select: { id: true, status: true, externalOrderId: true, platformData: true, customerName: true, totalAmount: true, integration: { select: { platform: true } } } },
        orderSession: { select: { id: true, tableNumber: true, customerName: true, notes: true, table: { select: { number: true } } } },
        comanda: { select: { id: true, tableNumber: true, customerName: true, notes: true, table: { select: { number: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 300,
    }),
    prisma.externalOrder.findMany({
      where: { restaurantId, createdAt: { gte: since }, OR: [{ status: 'PENDING' }, { status: 'PICKED_UP' }] },
      select: { id: true, status: true, externalOrderId: true, platformData: true, customerName: true, totalAmount: true, items: true, createdAt: true, internalOrderId: true, integration: { select: { platform: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
  ]);

  const cards: BoardCard[] = [];
  const seenExternal = new Set<string>();
  for (const o of orders) {
    const ext = o.externalOrder;
    if (ext) {
      seenExternal.add(ext.id);
      // Out for delivery is the delivery stage even while the kitchen order is still "ready"
      const stage: Stage = ext.status === 'PICKED_UP' ? 'entrega' : o.status === 'READY' ? 'pronto' : 'preparo';
      const channel = platformChannel(ext.integration?.platform);
      cards.push({
        id: o.id, channel, stage,
        label: `${CHANNEL_LABEL[channel]}: ${ext.customerName}`,
        number: channel === 'ifood' || channel === 'ninetynine' ? extNumber(ext) : `#${o.orderNumber.slice(-4)}`,
        items: o._count.items, totalCents: cents(o.total ?? ext.totalAmount), createdAt: o.createdAt.toISOString(),
        href: '/admin/integrations/orders',
      });
      continue;
    }
    const s = o.comanda ?? o.orderSession;
    const channel = sessionChannel(s);
    const table = s?.table?.number ?? s?.tableNumber;
    const label = channel === 'salao' ? `Mesa ${table}` : channel === 'whatsapp' ? `WhatsApp${s?.customerName ? `: ${s.customerName}` : ''}` : `Balcão${s?.customerName ? `: ${s.customerName}` : ''}`;
    cards.push({
      id: o.id, channel, stage: o.status === 'READY' ? 'pronto' : 'preparo', label,
      number: `#${o.orderNumber.slice(-4)}`, items: o._count.items, totalCents: cents(o.total), createdAt: o.createdAt.toISOString(),
      href: s ? `/vender/${s.id}` : '/cozinha',
    });
  }
  for (const e of externals) {
    if (seenExternal.has(e.id)) continue;
    // Out for delivery whose kitchen order was already finished, or waiting for "Aceitar"
    const channel = platformChannel(e.integration?.platform);
    let items = 0;
    try {
      const parsed = JSON.parse(e.items);
      items = Array.isArray(parsed) ? parsed.length : 0;
    } catch { /* items unreadable: 0 */ }
    cards.push({
      id: e.id, channel, stage: e.status === 'PENDING' ? 'novo' : 'entrega',
      label: `${CHANNEL_LABEL[channel]}: ${e.customerName}`, number: extNumber(e), items,
      totalCents: cents(e.totalAmount), createdAt: e.createdAt.toISOString(), href: '/admin/integrations/orders',
    });
  }
  return cards;
}
