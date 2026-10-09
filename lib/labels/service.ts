import { prisma } from '@/lib/prisma';
import { isManager, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { computeExpiry, daysFor, shelfLifeField, storagesOf, STORAGES, type ShelfLife, type Storage } from './rules';

/** Printing food labels (spec 2026-10-09 etiquetas, 4.1, 4.2, 5.1) */

export class LabelError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface LabelItem {
  type: 'RECIPE' | 'INGREDIENT';
  id: string;
  name: string;
  unit: string;
  storages: Storage[];
  shelfLife: ShelfLife;
  uses30d: number;
  batches: Array<{ id: string; batchNumber: string; expirationDate: Date }>;
}

const SHELF = { shelfLifeAmbientDays: true, shelfLifeChilledDays: true, shelfLifeFrozenDays: true } as const;
const shelf = (x: ShelfLife): ShelfLife => ({
  shelfLifeAmbientDays: x.shelfLifeAmbientDays,
  shelfLifeChilledDays: x.shelfLifeChilledDays,
  shelfLifeFrozenDays: x.shelfLifeFrozenDays,
});

/** What can be labelled: the restaurant's active preparations and ingredients, most labelled in 30 days first */
export async function listLabelItems(restaurantId: string, now = new Date()): Promise<LabelItem[]> {
  const since = new Date(now.getTime() - 30 * 864e5);
  const [recipes, ingredients, uses] = await Promise.all([
    prisma.recipe.findMany({ where: { restaurantId, active: true }, select: { id: true, name: true, yieldUnit: true, ...SHELF } }),
    prisma.ingredient.findMany({
      where: { restaurantId, active: true },
      select: {
        id: true, name: true, standardUnit: true, ...SHELF,
        batches: { where: { active: true }, orderBy: { expirationDate: 'asc' }, take: 10, select: { id: true, batchNumber: true, expirationDate: true } },
      },
    }),
    prisma.foodLabel.groupBy({ by: ['recipeId', 'ingredientId'], where: { restaurantId, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = new Map<string, number>();
  for (const u of uses) count.set((u.recipeId ?? u.ingredientId) as string, u._count._all);
  const items: LabelItem[] = [
    ...recipes.map((r) => ({ type: 'RECIPE' as const, id: r.id, name: r.name, unit: r.yieldUnit, shelfLife: shelf(r), storages: storagesOf(r), uses30d: count.get(r.id) ?? 0, batches: [] })),
    ...ingredients.map((i) => ({ type: 'INGREDIENT' as const, id: i.id, name: i.name, unit: i.standardUnit, shelfLife: shelf(i), storages: storagesOf(i), uses30d: count.get(i.id) ?? 0, batches: i.batches })),
  ];
  return items.sort((a, b) => b.uses30d - a.uses30d || a.name.localeCompare(b.name, 'pt-BR'));
}

export interface CreateLabelsInput {
  itemType: 'RECIPE' | 'INGREDIENT';
  itemId: string;
  storage: Storage;
  expiresAt?: string | null;
  quantity?: number | string | null;
  batchId?: string | null;
  copies?: number;
  saveAsDefaultDays?: number | null;
}

/**
 * One record per physical label (3 pots, 3 labels, 3 QR codes). The expiry comes from the item's
 * days for the storage, or the date typed; never in the past.
 */
export async function createLabels(member: RestaurantMember, input: CreateLabelsInput, now = new Date()) {
  if (input.itemType !== 'RECIPE' && input.itemType !== 'INGREDIENT') throw new LabelError('Escolha um preparo ou um insumo');
  if (!STORAGES.includes(input.storage)) throw new LabelError('Escolha a conservação');
  const copies = input.copies ?? 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 20) throw new LabelError('Número de etiquetas: de 1 a 20');
  const rawQty = input.quantity;
  const quantity = rawQty === null || rawQty === undefined || rawQty === '' ? null : Number(rawQty);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) throw new LabelError('Quantidade inválida');

  const item = input.itemType === 'RECIPE'
    ? await prisma.recipe.findFirst({ where: { id: input.itemId, restaurantId: member.restaurantId }, select: { id: true, name: true, yieldUnit: true, ...SHELF } })
    : await prisma.ingredient.findFirst({ where: { id: input.itemId, restaurantId: member.restaurantId }, select: { id: true, name: true, standardUnit: true, ...SHELF } });
  if (!item) throw new LabelError('Item não encontrado', 404);

  let batchId: string | null = null;
  if (input.batchId) {
    if (input.itemType !== 'INGREDIENT') throw new LabelError('Lote só vale para insumo');
    const batch = await prisma.ingredientBatch.findFirst({
      where: { id: input.batchId, ingredientId: item.id, ingredient: { restaurantId: member.restaurantId } },
      select: { id: true },
    });
    if (!batch) throw new LabelError('Lote não encontrado', 404);
    batchId = batch.id;
  }

  const days = daysFor(item, input.storage);
  let expiresAt: Date;
  if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new LabelError('Validade inválida');
  } else if (days !== null) {
    expiresAt = computeExpiry(now, days);
  } else {
    throw new LabelError('Este item não tem validade para esta conservação: informe a data');
  }
  if (expiresAt.getTime() <= now.getTime()) throw new LabelError('A validade precisa ser depois de agora');

  // "Salvar como padrão deste item": managers only (the cook prints, the manager sets the rules)
  if (input.saveAsDefaultDays !== null && input.saveAsDefaultDays !== undefined && isManager(member)) {
    const d = input.saveAsDefaultDays;
    if (!Number.isInteger(d) || d < 0 || d > 365) throw new LabelError('Validade em dias: número inteiro de 0 a 365');
    const data = { [shelfLifeField(input.storage)]: d };
    if (input.itemType === 'RECIPE') await prisma.recipe.update({ where: { id: item.id }, data });
    else await prisma.ingredient.update({ where: { id: item.id }, data });
  }

  const unit = ('yieldUnit' in item ? item.yieldUnit : item.standardUnit) as any;
  const ids: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < copies; i++) {
      const label = await tx.foodLabel.create({
        data: {
          restaurantId: member.restaurantId,
          itemType: input.itemType,
          recipeId: input.itemType === 'RECIPE' ? item.id : null,
          ingredientId: input.itemType === 'INGREDIENT' ? item.id : null,
          itemName: item.name,
          storage: input.storage,
          preparedAt: now,
          expiresAt,
          quantity,
          unit: quantity === null ? null : unit,
          batchId,
          printedById: member.userId,
        },
        select: { id: true },
      });
      ids.push(label.id);
    }
  });
  return { ids };
}

/** Labels printed in the last 30 days, newest first (reprint) */
export async function listRecentLabels(restaurantId: string, now = new Date()) {
  return prisma.foodLabel.findMany({
    where: { restaurantId, createdAt: { gte: new Date(now.getTime() - 30 * 864e5) } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { printedBy: { select: { name: true } } },
  });
}
