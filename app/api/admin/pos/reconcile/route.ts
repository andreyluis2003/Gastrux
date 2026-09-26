import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { reconcilePOSTransaction } from '@/lib/pos/reconcile';

export const dynamic = 'force-dynamic';

/**
 * Manual reconciliation of unreconciled POS transactions: each sale leaves stock once
 * (lib/pos/reconcile.ts). It used to read session.user.currentRestaurantId, which the session never
 * carries, so it always answered 400; it also let any role move stock.
 * POST: reconcile specific transactions or all pending.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Reconciliar vendas do PDV exige um gerente');
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const body = await req.json().catch(() => ({}));
  const transactionIds: string[] = Array.isArray(body.transactionIds) ? body.transactionIds.map(String) : [];

  const transactions = await prisma.pOSTransaction.findMany({
    where: {
      restaurantId: member.restaurantId,
      reconciled: false,
      ...(transactionIds.length > 0 ? { id: { in: transactionIds } } : {}),
    },
    select: { id: true },
    orderBy: { transactionDate: 'asc' },
    take: 100,
  });

  let reconciled = 0;
  let errors = 0;
  for (const tx of transactions) {
    try {
      if (await reconcilePOSTransaction(member.restaurantId, tx.id)) reconciled++;
    } catch (err) {
      console.error(`[Reconcile] Error tx ${tx.id}:`, err);
      errors++;
    }
  }

  if (reconciled > 0) {
    await recordAudit(member, {
      action: 'STOCK_DEDUCTION',
      entityType: 'POSTransaction',
      entityId: transactionIds.length === 1 ? transactionIds[0] : 'batch',
      changes: { reconciled, errors },
    });
  }

  return NextResponse.json({ total: transactions.length, reconciled, errors });
}

/**
 * GET: stats about reconciliation status
 */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES);
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;

  const [total, pending, completed] = await Promise.all([
    prisma.pOSTransaction.count({ where: { restaurantId } }),
    prisma.pOSTransaction.count({ where: { restaurantId, reconciled: false } }),
    prisma.pOSTransaction.count({ where: { restaurantId, reconciled: true } }),
  ]);

  return NextResponse.json({ total, pending, completed });
}
