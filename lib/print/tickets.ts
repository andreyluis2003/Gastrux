import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';

/**
 * Printing phase 1 (owner decision 2026-09-24: no printer yet): the kitchen ticket and the customer
 * receipt are built here, shown by /imprimir/* pages in 80 mm and printed by the browser, so they
 * work with any thermal printer bought later (market practice: "comanda de produção" in the
 * kitchen, receipt with the NFC-e at the counter). Both are scoped to the caller's restaurant.
 */

export interface KitchenTicket {
  restaurantName: string;
  orderNumber: string;
  kind: 'Mesa' | 'Balcão' | 'Delivery' | 'Pedido';
  where: string | null;
  createdAt: string;
  lines: Array<{ quantity: number; name: string; modifiers: string[]; notes: string | null }>;
  notes: string | null;
  deliveryAddress: string | null;
}

export async function buildKitchenTicket(restaurantId: string, orderId: string): Promise<KitchenTicket | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: {
      restaurant: { select: { name: true } },
      items: {
        include: {
          recipe: { select: { name: true } },
          modifiers: { include: { modifier: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
      orderSession: { select: { tableNumber: true, customerName: true, table: { select: { number: true } } } },
      externalOrder: { select: { customerName: true, deliveryAddress: true } },
    },
  });
  if (!order) return null;

  const session = order.orderSession;
  const tableNumber = session?.table?.number ?? session?.tableNumber ?? null;
  let kind: KitchenTicket['kind'] = 'Pedido';
  let where: string | null = null;
  if (tableNumber) {
    kind = 'Mesa';
    where = String(tableNumber);
  } else if (session) {
    kind = 'Balcão';
    where = session.customerName ?? null;
  } else if (order.externalOrder || order.orderType === 'DELIVERY') {
    kind = 'Delivery';
    where = order.externalOrder?.customerName ?? null;
  }

  return {
    restaurantName: order.restaurant?.name ?? '',
    orderNumber: order.orderNumber,
    kind,
    where,
    createdAt: order.createdAt.toISOString(),
    lines: order.items.map((item) => ({
      quantity: item.quantity,
      name: item.recipe?.name ?? 'Item',
      modifiers: item.modifiers.map((m) => m.modifier?.name).filter((n): n is string => !!n),
      notes: item.specialInstructions ?? null,
    })),
    notes: order.specialInstructions ?? null,
    deliveryAddress: order.externalOrder?.deliveryAddress ?? null,
  };
}

export interface Receipt {
  restaurant: { name: string; cnpj: string | null; stateRegistration: string | null; address: string | null };
  title: string;
  closedAt: string | null;
  status: string;
  lines: Array<{ quantity: number; name: string; unitPrice: number; total: number; modifiers: Array<{ name: string; price: number }> }>;
  total: number;
  customerCPF: string | null;
  paymentMethod: string | null;
  nfce: null | {
    status: string;
    number: number;
    series: number;
    accessKey: string | null;
    protocolNumber: string | null;
    authorizedAt: string | null;
    qrCodeData: string | null;
    officialDanfeUrl: string | null;
    homologation: boolean;
  };
}

export async function buildReceipt(restaurantId: string, sessionId: string): Promise<Receipt | null> {
  const session = await prisma.orderSession.findFirst({
    where: { id: sessionId, restaurantId },
    include: {
      restaurant: { select: { name: true, cnpj: true, address: true, city: true, state: true } },
      table: { select: { number: true } },
      items: {
        include: {
          recipe: { select: { name: true } },
          modifiers: { include: { modifier: { select: { name: true } } } },
        },
        orderBy: { addedAt: 'asc' },
      },
    },
  });
  if (!session) return null;

  const [doc, config] = await Promise.all([
    prisma.nFeDocument.findFirst({
      where: { orderSessionId: sessionId, config: { restaurantId }, status: { in: ['authorized', 'processing', 'submitted'] } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.nFeConfig.findFirst({ where: { restaurantId }, select: { cnpj: true, stateRegistration: true, companyName: true, tradeName: true, environment: true } }),
  ]);

  const lines = session.items.map((item) => {
    const adjustments = item.modifiers.map((m) => m.priceAdjustment);
    const totalCents = lineTotalCents(item.price, item.quantity, adjustments);
    return {
      quantity: item.quantity,
      name: item.recipe?.name ?? 'Item',
      unitPrice: Number(item.price),
      total: totalCents / 100,
      modifiers: item.modifiers.map((m) => ({ name: m.modifier?.name ?? 'Adicional', price: Number(m.priceAdjustment) })),
    };
  });
  const total = lines.reduce((sum, l) => sum + Math.round(l.total * 100), 0) / 100;
  const snapshot = (doc?.dataSnapshot ?? {}) as { paymentMethod?: string };
  const r = session.restaurant;

  return {
    restaurant: {
      name: config?.tradeName || config?.companyName || r.name,
      cnpj: config?.cnpj ?? r.cnpj ?? null,
      stateRegistration: config?.stateRegistration ?? null,
      address: [r.address, r.city, r.state].filter(Boolean).join(' - ') || null,
    },
    title: session.table?.number ? `Mesa ${session.table.number}` : session.tableNumber ? `Mesa ${session.tableNumber}` : session.customerName || 'Balcão',
    closedAt: session.closedAt?.toISOString() ?? null,
    status: session.status,
    lines,
    total,
    customerCPF: doc?.customerCPF ?? null,
    paymentMethod: snapshot.paymentMethod ?? null,
    nfce: doc
      ? {
          status: doc.status,
          number: doc.documentNumber,
          series: doc.documentSeries,
          accessKey: doc.accessKey,
          protocolNumber: doc.protocolNumber,
          authorizedAt: doc.authorizedAt?.toISOString() ?? null,
          qrCodeData: doc.qrCodeData,
          officialDanfeUrl: doc.pdfUrl,
          homologation: (config?.environment ?? 'sandbox') !== 'production',
        }
      : null,
  };
}
