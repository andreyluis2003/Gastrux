import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isProductRecipe } from './is-product-recipe';

export { isProductRecipe };

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
  item: { name: string; description: string | null; price: Prisma.Decimal | number; soldByWeight?: boolean },
) {
  // A free code: a taken one would abort the whole sale transaction (Postgres allows no retry after an error)
  let code = '';
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = `PROD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    if (!(await tx.recipe.findFirst({ where: { restaurantId, code: candidate }, select: { id: true } }))) code = candidate;
  }
  if (!code) code = `PROD-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  return tx.recipe.create({
    data: {
      restaurantId,
      code,
      name: item.name,
      description: item.description,
      baseYield: 1,
      // A product sold by weight: its ficha describes 1 kg (spec 2026-10-25 venda-por-peso)
      yieldUnit: item.soldByWeight ? 'kg' : 'un',
      portionSize: 1,
      portionUnit: item.soldByWeight ? 'kg' : 'un',
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
export async function ensureMenuItemRecipes(
  db: Db,
  restaurantId: string,
  menuItemIds?: string[],
  /** Public callers (QR, delivery site, WhatsApp): only items on sale, never a removed or unavailable one */
  opts: { onSaleOnly?: boolean } = {},
): Promise<number> {
  const ids = menuItemIds ? [...new Set(menuItemIds.filter(Boolean))] : undefined;
  if (ids && ids.length === 0) return 0;
  const where = { restaurantId, recipeId: null, ...(ids ? { id: { in: ids } } : {}), ...(opts.onSaleOnly ? { active: true, available: true } : {}) };
  // The usual case (every item linked) costs one read and no lock
  if ((await db.menuItem.count({ where })) === 0) return 0;

  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-item-recipe:' + restaurantId}))`;
    const missing = await tx.menuItem.findMany({ where, select: { id: true, name: true, description: true, price: true, soldByWeight: true } });
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
  if (!mi?.recipe || !isProductRecipe(mi.recipe)) return;
  // Shared with another item (linked by hand to its ficha simples): that item's name stays
  if ((await db.menuItem.count({ where: { recipeId: mi.recipe.id, restaurantId, NOT: { id: menuItemId } } })) > 0) return;
  await db.recipe.update({
    where: { id: mi.recipe.id },
    data: { name: mi.name, description: mi.description, sellingPrice: Number(mi.price) || 0 },
  });
}

/**
 * The restaurant's own fichas técnicas: every recipe but a ficha simples (made here, still without
 * ingredients). The plan's recipe limit and the home "Receitas" card count these (final review
 * 2026-10-12: the example drinks alone took most of Starter's 10 recipes).
 */
export const OWN_RECIPE_WHERE: Prisma.RecipeWhereInput = {
  NOT: { code: { startsWith: 'PROD-' }, ingredients: { none: {} } },
};


/**
 * A ficha simples no active menu item uses any more (its item moved to a real ficha técnica, or was
 * removed) leaves the Fichas técnicas list and the reports: set inactive, never deleted (past sale
 * lines point to it). Final review 2026-10-12.
 */
export async function retireProductRecipe(db: Db, restaurantId: string, recipeId: string | null | undefined) {
  if (!recipeId) return;
  const recipe = await db.recipe.findFirst({
    where: { id: recipeId, restaurantId, active: true },
    select: { id: true, code: true, _count: { select: { ingredients: true } } },
  });
  if (!recipe || !isProductRecipe(recipe)) return;
  if ((await db.menuItem.count({ where: { recipeId, restaurantId, active: true } })) > 0) return;
  await db.recipe.update({ where: { id: recipeId }, data: { active: false } });
}
