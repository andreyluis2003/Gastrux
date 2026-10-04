import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRestaurantMember, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { emitStandaloneNFCe } from '@/lib/nfe/emit-standalone';

export const dynamic = 'force-dynamic';

/**
 * A manager of the restaurant being worked in. It used to read session.user.currentRestaurantId, a
 * field the session never carries, so this page never loaded nor saved anything (browser test of
 * 2026-09-25).
 */
async function getContext() {
  const member = await getRestaurantMember();
  if (!member || !MANAGER_ROLES.includes(member.role)) return null;
  return { restaurantId: member.restaurantId };
}

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const config = await prisma.nFeConfig.findUnique({
    where: { restaurantId: ctx.restaurantId },
  });
  if (!config) {
    return NextResponse.json({ documents: [], stats: { total: 0, authorized: 0, pending: 0, cancelled: 0, rejected: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  const where: any = { configId: config.id };
  if (status) where.status = status;
  if (type) where.documentType = type;

  const [documents, stats] = await Promise.all([
    prisma.nFeDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    }),
    prisma.nFeDocument.groupBy({
      by: ['status'],
      where: { configId: config.id },
      _count: true,
    }),
  ]);

  const statusCounts = Object.fromEntries(stats.map((s: any) => [s.status, s._count]));

  return NextResponse.json({
    documents: documents.map((d: any) => ({
      ...d,
      totalAmount: Number(d.totalAmount),
      items: d.items.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    })),
    stats: {
      total: Object.values(statusCounts).reduce((a: any, b: any) => a + b, 0) as number,
      authorized: statusCounts['authorized'] || 0,
      pending: statusCounts['pending'] || 0,
      cancelled: statusCounts['cancelled'] || 0,
      rejected: statusCounts['rejected'] || 0,
    },
  });
}

/**
 * POST: a stand-alone NFC-e typed on this page (lib/nfe/emit-standalone.ts: real fiscal data,
 * atomic number, really sent to the provider). NF-e is not issued from here.
 */
export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.documentType && body.documentType !== 'NFCe') {
    return NextResponse.json({ error: 'Aqui só é possível emitir NFC-e (consumidor). NF-e ainda não é emitida pelo Gastrux.' }, { status: 400 });
  }

  const outcome = await emitStandaloneNFCe({
    restaurantId: ctx.restaurantId,
    items: body.items,
    customerCPF: body.customerCPF,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    paymentMethod: body.paymentMethod,
  });
  if (outcome.httpStatus >= 400) return NextResponse.json(outcome.body, { status: outcome.httpStatus });

  const doc: any = outcome.body.document;
  return NextResponse.json({
    ...outcome.body,
    document: {
      ...doc,
      totalAmount: Number(doc.totalAmount),
      items: doc.items.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    },
  }, { status: 201 });
}
