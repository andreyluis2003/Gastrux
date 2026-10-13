import { Prisma } from '@prisma/client';
import { convertUnits } from '@/lib/utils';

/**
 * Compras: the items of a received list enter stock (2026-10-13: Recebido only changed the status, so a
 * purchase never reached Estoque nor the ingredient cost). `checkedOnly` is Parcial: the checked items
 * arrived; Recebido brings the rest. Each item enters once, marked by its movement
 * (referenceType SHOPPING_LIST_ITEM, referenceId = the item), so a retry or a second tap adds nothing.
 * The quantity is converted to the ingredient's unit; the Stock row is created when missing (the first
 * purchase of a new account); the reference cost becomes the list price per unit.
 * Items that are not a registered ingredient ("Item não cadastrado") are skipped and named.
 */
export async function receiveShoppingList(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  listId: string,
  { checkedOnly }: { checkedOnly: boolean },
): Promise<{ entered: number; skipped: string[] }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'shopping-list:' + listId}))`;
  const items = await tx.shoppingListItem.findMany({
    where: { shoppingListId: listId, restaurantId, ...(checkedOnly ? { checked: true } : {}) },
    select: { id: true, ingredientId: true, quantity: true, unit: true, estimatedCost: true, actualCost: true, notes: true, supplier: { select: { ingredientId: true } } },
  });
  const done = new Set(
    (await tx.stockMovement.findMany({
      where: { restaurantId, referenceType: 'SHOPPING_LIST_ITEM', referenceId: { in: items.map((i) => i.id) } },
      select: { referenceId: true },
    })).map((m) => m.referenceId),
  );

  let entered = 0;
  const skipped: string[] = [];
  for (const item of items) {
    if (done.has(item.id)) continue;
    const ingredientId = item.ingredientId ?? item.supplier?.ingredientId ?? null;
    const ingredient = ingredientId
      ? await tx.ingredient.findFirst({ where: { id: ingredientId, restaurantId }, select: { id: true, name: true, standardUnit: true, conversionFactor: true } })
      : null;
    if (!ingredient) {
      skipped.push((item.notes ?? '').replace(/^Item não cadastrado:\s*/, '') || 'item sem insumo');
      continue;
    }
    const quantity = convertUnits(item.quantity, item.unit, ingredient.standardUnit, ingredient.conversionFactor);
    if (!(quantity > 0)) continue;

    await tx.stockMovement.create({
      data: {
        restaurantId, ingredientId: ingredient.id, quantity, movementType: 'ENTRY',
        reason: 'Compra recebida', referenceType: 'SHOPPING_LIST_ITEM', referenceId: item.id,
      },
    });
    await tx.stock.upsert({
      where: { restaurantId_ingredientId: { restaurantId, ingredientId: ingredient.id } },
      create: { restaurantId, ingredientId: ingredient.id, currentQuantity: quantity },
      update: { currentQuantity: { increment: quantity }, lastUpdated: new Date() },
    });
    const cost = item.actualCost ?? item.estimatedCost;
    if (cost > 0) {
      await tx.ingredient.update({ where: { id: ingredient.id }, data: { referenceCost: cost / quantity, lastCostUpdate: new Date() } });
    }
    entered++;
  }
  return { entered, skipped };
}
