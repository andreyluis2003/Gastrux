import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Ficha simples (owner, 2026-10-12): a menu item sold as bought (a soda, a water) or not yet given its
 * ficha técnica. The sale lines need a recipe (the bill, the kitchen, the cupom, the NFC-e fiscal data
 * and the reports read them through it), so the item gets one with its own name and price and no
 * ingredients: nothing leaves stock and its cost is zero until the owner adds ingredients to it in
 * Fichas técnicas. It used to be refused on every sale ("vincule uma receita primeiro"), and the sign-up
 * example menu itself created its drinks that way.
 */
export async function createProductRecipe(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  item: { name: string; description: string | null; price: Prisma.Decimal | number },
) {
  return tx.recipe.create({
    data: {
      restaurantId,
      code: `PROD-${randomBytes(4).toString('hex').toUpperCase()}`,
      name: item.name,
      description: item.description,
      baseYield: 1,
      yieldUnit: 'un',
      portionSize: 1,
      portionUnit: 'un',
      sellingPrice: Number(item.price) || 0,
    },
    select: { id: true },
  });
}

/**
 * Links a ficha simples to the menu items of this restaurant that have none (only `menuItemIds`, or
 * all of them). Under a per-restaurant lock, re-read after it: two sales of the same item at the same
 * instant create one ficha. Returns how many items were linked.
 */
export async function ensureMenuItemRecipes(db: Db, restaurantId: string, menuItemIds?: string[]): Promise<number> {
  const ids = menuItemIds ? [...new Set(menuItemIds.filter(Boolean))] : undefined;
  if (ids && ids.length === 0) return 0;
  const where = { restaurantId, recipeId: null, ...(ids ? { id: { in: ids } } : {}) };
  // The usual case (every item linked) costs one read and no lock
  if ((await db.menuItem.count({ where })) === 0) return 0;

  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-item-recipe:' + restaurantId}))`;
    const missing = await tx.menuItem.findMany({ where, select: { id: true, name: true, description: true, price: true } });
    for (const mi of missing) {
      const recipe = await createProductRecipe(tx, restaurantId, mi);
      await tx.menuItem.update({ where: { id: mi.id }, data: { recipeId: recipe.id } });
    }
    return missing.length;
  };
  return '$transaction' in db ? (db as typeof prisma).$transaction(run) : run(db as Prisma.TransactionClient);
}

/**
 * A renamed or repriced menu item: its ficha simples follows (the comanda, the kitchen and the cupom
 * show the ficha's name). A real ficha técnica (one with ingredients, or not made here) is the
 * kitchen's own and is never touched.
 */
export async function syncProductRecipe(db: Db, restaurantId: string, menuItemId: string) {
  const mi = await db.menuItem.findFirst({
    where: { id: menuItemId, restaurantId },
    select: { name: true, description: true, price: true, recipe: { select: { id: true, code: true, _count: { select: { ingredients: true } } } } },
  });
  if (!mi?.recipe || !mi.recipe.code.startsWith('PROD-') || mi.recipe._count.ingredients > 0) return;
  await db.recipe.update({
    where: { id: mi.recipe.id },
    data: { name: mi.name, description: mi.description, sellingPrice: Number(mi.price) || 0 },
  });
}
