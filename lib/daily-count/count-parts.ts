import type { Prisma, PrismaClient } from '@prisma/client';
import { DailyCountError } from './compute';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * "Na contagem do dia, conta como" (spec docs/superpowers/specs/2026-10-26-lanchonete-revisao-design.md): a
 * combo, or a cento of salgados, counts as items of the daily count. Stock and cost stay on its own ficha.
 */

export const MAX_COUNT_PARTS = 10;
export const MAX_PART_QUANTITY = 1000;

export interface CountPartInput {
  recipeId: string;
  quantity: number;
}

/** undefined = not sent (keep what is saved); [] = none */
export function parseCountParts(value: unknown): CountPartInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DailyCountError('Itens da contagem inválidos');
  if (value.length > MAX_COUNT_PARTS) throw new DailyCountError(`No máximo ${MAX_COUNT_PARTS} itens da contagem`);
  const seen = new Set<string>();
  return value.map((p) => {
    const recipeId = typeof p?.recipeId === 'string' ? p.recipeId : '';
    const quantity = p?.quantity;
    if (!recipeId || seen.has(recipeId)) throw new DailyCountError('Itens da contagem inválidos');
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PART_QUANTITY) {
      throw new DailyCountError(`A quantidade na contagem vai de 1 a ${MAX_PART_QUANTITY}`);
    }
    seen.add(recipeId);
    return { recipeId, quantity };
  });
}

/**
 * Checks and saves the parts of a recipe. A part is a counted recipe of the same restaurant, never the
 * recipe itself; a counted recipe has no parts (it counts as itself). `parts` undefined keeps the saved ones.
 */
export async function saveCountParts(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  recipeId: string,
  dailyCount: boolean,
  parts: CountPartInput[] | undefined,
) {
  const effective = parts ?? (await tx.recipeCountPart.findMany({ where: { recipeId }, select: { partRecipeId: true, quantity: true } }))
    .map((p) => ({ recipeId: p.partRecipeId, quantity: p.quantity }));
  if (dailyCount && effective.length) throw new DailyCountError('Um item da contagem conta como ele mesmo: tire os itens de "conta como" antes de marcá-lo');
  if (parts === undefined) return;
  if (parts.some((p) => p.recipeId === recipeId)) throw new DailyCountError('Um item não pode contar como ele mesmo');
  const counted = await tx.recipe.count({ where: { id: { in: parts.map((p) => p.recipeId) }, restaurantId, dailyCount: true } });
  if (counted !== parts.length) throw new DailyCountError('Escolha só itens marcados para a contagem do dia');
  await tx.recipeCountPart.deleteMany({ where: { recipeId } });
  if (parts.length) {
    await tx.recipeCountPart.createMany({ data: parts.map((p) => ({ restaurantId, recipeId, partRecipeId: p.recipeId, quantity: p.quantity })) });
  }
}

/** The recipes that count as any of `partIds`: combo recipeId → [{ partRecipeId, quantity }] */
export async function combosCountingAs(db: Db, restaurantId: string, partIds: string[]) {
  if (!partIds.length) return new Map<string, { partRecipeId: string; quantity: number }[]>();
  const rows = await db.recipeCountPart.findMany({ where: { restaurantId, partRecipeId: { in: partIds } }, select: { recipeId: true, partRecipeId: true, quantity: true } });
  const out = new Map<string, { partRecipeId: string; quantity: number }[]>();
  for (const r of rows) out.set(r.recipeId, [...(out.get(r.recipeId) ?? []), { partRecipeId: r.partRecipeId, quantity: r.quantity }]);
  return out;
}
