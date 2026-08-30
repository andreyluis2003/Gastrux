import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const user = session.user as any;
  if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'OWNER'].includes(user.role)) return null;
  const restaurantId = user.currentRestaurantId;
  if (!restaurantId) return null;
  return { session, restaurantId };
}

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');
  const status = searchParams.get('status');
  const period = searchParams.get('period') || '7d';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  const now = new Date();
  const periodDays = period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const where: any = {
    restaurantId: ctx.restaurantId,
    transactionDate: { gte: since },
  };
  if (provider) where.provider = provider;
  if (status) where.status = status;

  const [items, totals, byMethod, byDay, byProvider] = await Promise.all([
    prisma.pOSTransaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      take: limit,
      include: { saleItems: { include: { recipe: { select: { id: true, name: true, code: true } } } } },
    }),
    prisma.pOSTransaction.aggregate({
      where,
      _count: true,
      _sum: { amount: true, discount: true, tax: true, netAmount: true },
      _avg: { amount: true },
    }),
    prisma.pOSTransaction.groupBy({
      by: ['paymentMethod'],
      where,
      _count: true,
      _sum: { amount: true },
    }),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE("transactionDate") as day, COUNT(*)::int as count, SUM("amount")::float as total
       FROM pos_transactions
       WHERE "restaurantId" = $1 AND "transactionDate" >= $2
       GROUP BY DATE("transactionDate")
       ORDER BY day ASC`,
      ctx.restaurantId,
      since
    ),
    prisma.pOSTransaction.groupBy({
      by: ['provider'],
      where,
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  return NextResponse.json({
    items: items.map((t: any) => ({
      ...t,
      amount: Number(t.amount),
      discount: Number(t.discount),
      tax: Number(t.tax),
      netAmount: Number(t.netAmount),
      saleItems: t.saleItems.map((si: any) => ({
        ...si,
        unitPrice: Number(si.unitPrice),
        totalPrice: Number(si.totalPrice),
      })),
    })),
    stats: {
      count: totals._count,
      total: Number(totals._sum?.amount || 0),
      discount: Number(totals._sum?.discount || 0),
      tax: Number(totals._sum?.tax || 0),
      net: Number(totals._sum?.netAmount || 0),
      average: Number(totals._avg?.amount || 0),
      byPaymentMethod: byMethod.map((r: any) => ({
        method: r.paymentMethod,
        count: r._count,
        total: Number(r._sum?.amount || 0),
      })),
      byDay: byDay.map((d: any) => ({ day: d.day, count: d.count, total: d.total })),
      byProvider: byProvider.map((p: any) => ({
        provider: p.provider,
        count: p._count,
        total: Number(p._sum?.amount || 0),
      })),
    },
  });
}
