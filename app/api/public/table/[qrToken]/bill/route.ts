import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadBill } from '@/lib/comanda/bill-service';
import { toPublicBill, type PublicTableBill } from '@/lib/comanda/public-bill';
import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentEnabled } from '@/lib/mercadopago-connect/table-payment-access';

export const dynamic = 'force-dynamic';

const OPEN = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;
const noStore = { 'Cache-Control': 'no-store' };

/**
 * GET: the open bill of THIS table for the people sitting at it (no login). `?session=<id>` is the comanda
 * the screen was paying: once it closes, the screen is told so (with the NFC-e link) instead of "no bill".
 */
export async function GET(req: NextRequest, { params }: { params: { qrToken: string } }) {
  const table = await prisma.table.findUnique({ where: { qrToken: params.qrToken }, select: { id: true, restaurantId: true } });
  if (!table) return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
  if (!(await tablePaymentEnabled(table.restaurantId))) {
    return NextResponse.json({ error: TABLE_PAYMENT_UNAVAILABLE }, { status: 403, headers: noStore });
  }

  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: [...OPEN] } },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });
  if (session) {
    const bill = await loadBill(prisma, table.restaurantId, session.id);
    if (bill && bill.items.length) return NextResponse.json(toPublicBill(bill) satisfies PublicTableBill, { headers: noStore });
  }

  const asked = new URL(req.url).searchParams.get('session');
  if (asked) {
    const closed = await prisma.orderSession.findFirst({
      where: { id: asked, tableId: table.id, restaurantId: table.restaurantId, status: 'CLOSED' },
      select: { id: true },
    });
    if (closed) {
      const note = await prisma.nFeDocument.findFirst({
        where: { orderSessionId: closed.id, status: 'authorized', config: { restaurantId: table.restaurantId } },
        orderBy: { createdAt: 'desc' },
        select: { qrCodeUrl: true },
      });
      const out: PublicTableBill = { status: 'CLOSED', sessionId: closed.id, nfceUrl: note?.qrCodeUrl ?? null };
      return NextResponse.json(out, { headers: noStore });
    }
  }
  const none: PublicTableBill = { status: 'NONE' };
  return NextResponse.json(none, { headers: noStore });
}
