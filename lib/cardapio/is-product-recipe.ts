/** A ficha simples: made by Gastrux for a menu item sold without a ficha técnica, still without ingredients (no database here: the cardápio screen uses it too) */
export function isProductRecipe(recipe: { code: string; _count?: { ingredients: number }; ingredients?: unknown[] }): boolean {
  const count = recipe._count?.ingredients ?? recipe.ingredients?.length ?? 0;
  return recipe.code.startsWith('PROD-') && count === 0;
}
