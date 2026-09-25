import { prisma } from '@/lib/prisma';

/**
 * Takes a sale that came from an external card machine / POS out of stock, once.
 *
 * Shared by the POS webhook (auto-reconcile) and the manual "Reconciliar" button. Before this, both
 * decremented stock first and marked the sale reconciled afterwards, outside a transaction: a crash
 * or two clicks in between took the same sale out of stock twice. Now the sale is claimed
 * (reconciled false -> true) and the stock is moved in one database transaction; a sale that was
 * already claimed moves nothing.
 *
 * Returns true when this call reconciled the sale, false when it was already reconciled or does not
 * belong to the restaurant.
 */
export async function reconcilePOSTransaction(restaurantId: string, transactionId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.pOSTransaction.updateMany({
      where: { id: transactionId, restaurantId, reconciled: false },
      data: { reconciled: true, reconciledAt: new Date() },
    });
    if (claimed.count === 0) return false;

    const saleItems = await tx.pOSSaleItem.findMany({
      where: { transactionId, recipeId: { not: null } },
      select: { name: true, quantity: true, recipeId: true },
    });
    if (saleItems.length === 0) return true;

    // Only this restaurant's recipes: a recipe id from elsewhere moves nothing
    const recipeIngredients = await tx.recipeIngredient.findMany({
      where: {
        recipeId: { in: saleItems.map((si) => si.recipeId as string) },
        recipe: { restaurantId },
      },
      select: { recipeId: true, ingredientId: true, quantity: true },
    });

    const totals = new Map<string, { quantity: number; items: string[] }>();
    for (const item of saleItems) {
      for (const ri of recipeIngredients) {
        if (ri.recipeId !== item.recipeId) continue;
        const entry = totals.get(ri.ingredientId) ?? { quantity: 0, items: [] };
        entry.quantity += Number(ri.quantity) * Number(item.quantity);
        entry.items.push(`${item.name} x${item.quantity}`);
        totals.set(ri.ingredientId, entry);
      }
    }

    for (const [ingredientId, { quantity, items }] of Array.from(totals)) {
      if (quantity <= 0) continue;
      // Same rule as the kitchen deduction: an ingredient with no stock record is not created here
      const moved = await tx.stock.updateMany({
        where: { restaurantId, ingredientId },
        data: { currentQuantity: { decrement: quantity }, lastUpdated: new Date() },
      });
      if (moved.count === 0) continue;
      await tx.stockMovement.create({
        data: {
          restaurantId,
          ingredientId,
          movementType: 'AUTO_DEDUCTION',
          quantity: -quantity,
          reason: `Venda PDV - ${items.join(', ')}`.slice(0, 250),
          referenceId: transactionId,
          referenceType: 'POS_TRANSACTION',
        },
      });
    }
    return true;
  });
}
