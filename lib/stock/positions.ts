import { prisma } from '@/lib/prisma';

/**
 * Estoque position of every active insumo (2026-10-18 UX research, proposal 3). It used to list only insumos with a
 * Stock row, so a new account with 12 insumos read "Nenhum item de estoque": the row appears with the first entry.
 */
export type StockStatus = 'CRITICAL' | 'LOW' | 'OK';

export interface StockPosition {
  ingredientId: string;
  name: string;
  code: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  quantity: number;
  minimum: number;
  referenceCost: number;
  /** false until the first entry, count or sale of this insumo */
  hasStock: boolean;
  status: StockStatus;
}

/** Same rule the page always used: below half the minimum is critical, below the minimum is low */
export function stockStatus(quantity: number, minimum: number): StockStatus {
  if (quantity < minimum * 0.5) return 'CRITICAL';
  if (quantity < minimum) return 'LOW';
  return 'OK';
}

export async function stockPositions(restaurantId: string): Promise<StockPosition[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, active: true },
    select: {
      id: true, name: true, code: true, standardUnit: true, minimumStock: true, referenceCost: true,
      category: { select: { id: true, name: true } },
      currentStock: { select: { currentQuantity: true } },
    },
    orderBy: { name: 'asc' },
  });
  return ingredients.map((i) => {
    const row = i.currentStock;
    const quantity = row?.currentQuantity ?? 0;
    const minimum = i.minimumStock || 0;
    return {
      ingredientId: i.id, name: i.name, code: i.code, unit: i.standardUnit,
      categoryId: i.category?.id ?? null, categoryName: i.category?.name ?? null,
      quantity, minimum, referenceCost: i.referenceCost, hasStock: !!row, status: stockStatus(quantity, minimum),
    };
  });
}
