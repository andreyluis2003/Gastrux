import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Adds one line to a comanda. The price always comes from the restaurant's menu (menu item price,
 * else the recipe selling price) and each modifier's surcharge from its own record: the device
 * never sets a price. Shared by POST /api/comanda/sessions/[id]/items and the counter sale.
 *
 * The comanda screen always sent `modifierIds` with the line, but the route ignored them: the
 * chosen modifiers were never saved, charged nor sent to the kitchen.
 */
export interface AddItemInput {
  menuItemId?: string | null;
  recipeId?: string | null;
  quantity?: number;
  specialInstructions?: string | null;
  modifierIds?: string[];
}

export class AddItemError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

export async function addComandaItem(db: Db, restaurantId: string, sessionId: string, input: AddItemInput) {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AddItemError('Quantidade inválida: use um número inteiro a partir de 1', 400);
  }

  let recipeId = input.recipeId || null;
  let price: number | null = null;

  if (input.menuItemId) {
    const menuItem = await db.menuItem.findFirst({
      where: { id: input.menuItemId, restaurantId },
      include: { recipe: { select: { id: true } } },
    });
    if (!menuItem) throw new AddItemError('Menu item not found', 404);
    recipeId = menuItem.recipeId || menuItem.recipe?.id || null;
    price = Number(menuItem.price) || 0;
  }

  if (!recipeId) {
    throw new AddItemError('Este item do cardápio não está vinculado a uma receita. Vincule uma receita primeiro.', 400);
  }
  const recipe = await db.recipe.findFirst({ where: { id: recipeId, restaurantId } });
  if (!recipe) throw new AddItemError('Recipe not found', 404);
  if (price === null) price = Number(recipe.sellingPrice) || 0;

  const modifierIds = [...new Set(input.modifierIds ?? [])];
  const modifiers = modifierIds.length
    ? await db.itemModifier.findMany({ where: { id: { in: modifierIds }, restaurantId } })
    : [];
  if (modifiers.length !== modifierIds.length) throw new AddItemError('Modificador não encontrado', 404);

  return db.orderSessionItem.create({
    data: {
      sessionId,
      recipeId,
      quantity,
      price: new Prisma.Decimal(price),
      specialInstructions: input.specialInstructions || null,
      modifiers: {
        create: modifiers.map((m) => ({ modifierId: m.id, priceAdjustment: m.priceAdjustment })),
      },
    },
    include: {
      recipe: { select: { name: true, sellingPrice: true } },
      modifiers: { include: { modifier: { select: { name: true } } } },
    },
  });
}
