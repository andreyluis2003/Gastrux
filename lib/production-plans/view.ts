/**
 * A production plan as the cook sees it (2026-10-23): quantities, no costs and no recipe prices. Changes and
 * costs are the owner's and the manager's, as on Escalonar receita.
 */
export function withoutCost<T extends { totalCost?: unknown; items: Array<{ estimatedCost?: unknown; recipe: { id: string; name: string; code: string | null } }> }>(plan: T) {
  return {
    ...plan,
    totalCost: null,
    items: plan.items.map(({ recipe, ...item }) => ({ ...item, estimatedCost: null, recipe: { id: recipe.id, name: recipe.name, code: recipe.code } })),
  };
}
