import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Manual reconciliation of unreconciled POS transactions.
 * POST: reconcile specific transactions or all pending.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  const restaurantId = user.currentRestaurantId;
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });

  const body = await req.json();
  const transactionIds: string[] = body.transactionIds || [];

  const where: any = {
    restaurantId,
    reconciled: false,
  };
  if (transactionIds.length > 0) {
    where.id = { in: transactionIds };
  }

  const transactions = await prisma.pOSTransaction.findMany({
    where,
    include: { saleItems: true },
    take: 100,
  });

  let reconciled = 0;
  let errors = 0;

  for (const tx of transactions) {
    try {
      const recipeIds = tx.saleItems.filter((si: any) => si.recipeId).map((si: any) => si.recipeId);
      if (recipeIds.length === 0) {
        await prisma.pOSTransaction.update({
          where: { id: tx.id },
          data: { reconciled: true, reconciledAt: new Date() },
        });
        reconciled++;
        continue;
      }

      const recipeIngredients = await prisma.recipeIngredient.findMany({
        where: { recipeId: { in: recipeIds } },
      });

      const byRecipe: Record<string, any[]> = {};
      for (const ri of recipeIngredients) {
        if (!byRecipe[ri.recipeId]) byRecipe[ri.recipeId] = [];
        byRecipe[ri.recipeId].push(ri);
      }

      for (const saleItem of tx.saleItems) {
        if (!saleItem.recipeId || !byRecipe[saleItem.recipeId]) continue;
        for (const ri of byRecipe[saleItem.recipeId]) {
          const deduction = ri.quantity * saleItem.quantity;
          const stock = await prisma.stock.findFirst({ where: { ingredientId: ri.ingredientId } });
          if (stock) {
            await prisma.stock.update({
              where: { id: stock.id },
              data: { currentQuantity: { decrement: deduction } },
            });
            await prisma.stockMovement.create({
              data: {
                restaurantId,
                ingredientId: ri.ingredientId,
                movementType: 'AUTO_DEDUCTION',
                quantity: -Math.abs(deduction),
                reason: `Reconciliação PDV - ${saleItem.name} x${saleItem.quantity}`,
              },
            });
          }
        }
      }

      await prisma.pOSTransaction.update({
        where: { id: tx.id },
        data: { reconciled: true, reconciledAt: new Date() },
      });
      reconciled++;
    } catch (err) {
      console.error(`[Reconcile] Error tx ${tx.id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    total: transactions.length,
    reconciled,
    errors,
  });
}

/**
 * GET: stats about reconciliation status
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  const restaurantId = user.currentRestaurantId;
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });

  const [total, pending, completed] = await Promise.all([
    prisma.pOSTransaction.count({ where: { restaurantId } }),
    prisma.pOSTransaction.count({ where: { restaurantId, reconciled: false } }),
    prisma.pOSTransaction.count({ where: { restaurantId, reconciled: true } }),
  ]);

  return NextResponse.json({ total, pending, completed });
}
