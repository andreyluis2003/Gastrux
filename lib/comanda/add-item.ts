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

/** A new item after the pre-bill: the table is ordering again, not waiting for the bill (spec 2026-10-07, 4.3) */
async function clearPreBill(db: Db, sessionId: string) {
  await db.orderSession.updateMany({ where: { id: sessionId, preBillPrintedAt: { not: null } }, data: { preBillPrintedAt: null } });
}

export async function addComandaItem(db: Db, restaurantId: string, sessionId: string, input: AddItemInput) {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AddItemError('Quantidade inválida: use um número inteiro a partir de 1', 400);
  }
  // Same limit as editing a line (app/api/comanda/sessions/[id]/items/[itemId])
  if (input.specialInstructions && String(input.specialInstructions).length > 140) {
    throw new AddItemError('Observação longa demais (máx. 140 caracteres)', 400);
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

  const created = await db.orderSessionItem.create({
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
  await clearPreBill(db, sessionId);
  return created;
}

/** Serialises the writes of one comanda that must see each other: one-tap adds and the send to the kitchen */
export async function lockComanda(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-session:' + sessionId}))`;
}

/**
 * A one-tap add (spec 2026-10-07, 4.2): one unit more on the same new plain line (same recipe and
 * price, no modifiers, no note, not sent to the kitchen) or a new line. Decided on the server, under
 * the comanda lock: the screen used to send the new quantity computed from what it showed, so two
 * quick taps (or two devices) both sent "3" and a unit was lost, or both created a line.
 */
export async function addOrMergeComandaItem(restaurantId: string, sessionId: string, input: AddItemInput) {
  return prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const plain = !(input.modifierIds ?? []).length && !String(input.specialInstructions ?? '').trim();
    if (plain && input.menuItemId) {
      const menuItem = await tx.menuItem.findFirst({ where: { id: input.menuItemId, restaurantId }, select: { recipeId: true, price: true } });
      const session = await tx.orderSession.findFirst({ where: { id: sessionId, restaurantId }, select: { sentToKitchenAt: true } });
      if (menuItem?.recipeId && session) {
        const target = await tx.orderSessionItem.findFirst({
          where: {
            sessionId,
            recipeId: menuItem.recipeId,
            price: menuItem.price,
            specialInstructions: null,
            modifiers: { none: {} },
            ...(session.sentToKitchenAt ? { addedAt: { gt: session.sentToKitchenAt } } : {}),
          },
          orderBy: { addedAt: 'desc' },
          select: { id: true },
        });
        if (target) {
          const quantity = input.quantity ?? 1;
          if (!Number.isInteger(quantity) || quantity < 1) {
            throw new AddItemError('Quantidade inválida: use um número inteiro a partir de 1', 400);
          }
          const item = await tx.orderSessionItem.update({
            where: { id: target.id },
            data: { quantity: { increment: quantity } },
            include: {
              recipe: { select: { name: true, sellingPrice: true } },
              modifiers: { include: { modifier: { select: { name: true } } } },
            },
          });
          await clearPreBill(tx, sessionId);
          return { item, merged: true };
        }
      }
    }
    return { item: await addComandaItem(tx, restaurantId, sessionId, input), merged: false };
  });
}
