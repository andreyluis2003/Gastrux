import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { templateFor, type IngredientCategoryKey } from './starter-templates';

/**
 * Puts the example menu of a business type in a restaurant (the "Comece com" of the sign-up questions).
 * Only a restaurant with no ingredient and no recipe receives it: answering the questions twice, or
 * an account that already has its own data, never gets examples mixed in. Codes start with DEMO-, the
 * same prefix the old fixed example used, so they are easy to find and remove.
 * Example ingredients have no minimum stock: with nothing counted yet, a minimum would open the
 * dashboard on a false "Estoque Baixo" (fixed 2026-10-05).
 */
export async function seedStarterTemplate(restaurantId: string, businessType: string | null | undefined): Promise<{ seeded: boolean; template: string }> {
  const template = templateFor(businessType);

  const [ingredientCount, recipeCount] = await Promise.all([
    prisma.ingredient.count({ where: { restaurantId } }),
    prisma.recipe.count({ where: { restaurantId } }),
  ]);
  if (ingredientCount > 0 || recipeCount > 0) return { seeded: false, template: template.slug };

  await prisma.$transaction(async (tx) => {
    // Ingredient categories: the sign-up creates them; create the missing ones
    const wanted = [...new Set(template.ingredients.map((i) => i.category))] as IngredientCategoryKey[];
    const existing = await tx.ingredientCategory.findMany({ where: { restaurantId, name: { in: wanted } } });
    const categoryId: Record<string, string> = Object.fromEntries(existing.map((c) => [c.name, c.id]));
    for (const name of wanted) {
      if (!categoryId[name]) categoryId[name] = (await tx.ingredientCategory.create({ data: { restaurantId, name } })).id;
    }

    const ingredientId: Record<string, string> = {};
    for (const ing of template.ingredients) {
      const row = await tx.ingredient.create({
        data: {
          restaurantId,
          code: `DEMO-${ing.key}`,
          name: ing.name,
          categoryId: categoryId[ing.category],
          standardUnit: ing.unit,
          purchaseUnit: ing.unit,
          conversionFactor: 1,
          minimumStock: 0,
          referenceCost: ing.cost,
        },
      });
      ingredientId[ing.key] = row.id;
    }

    const recipeId: Record<string, string> = {};
    for (const r of template.recipes) {
      const row = await tx.recipe.create({
        data: {
          restaurantId,
          code: `DEMO-R-${r.key}`,
          name: r.name,
          description: r.description,
          baseYield: 1,
          yieldUnit: 'un',
          portionSize: 1,
          portionUnit: 'un',
          prepTimeMinutes: r.prepMinutes,
          sellingPrice: r.price,
          ingredients: {
            create: r.items.map((i) => ({ ingredientId: ingredientId[i.ingredient], quantity: i.qty, unit: i.unit })),
          },
        },
      });
      recipeId[r.key] = row.id;
    }

    const menuCategoryId: Record<string, string> = {};
    for (const [position, c] of template.menuCategories.entries()) {
      menuCategoryId[c.name] = (await tx.menuCategory.create({ data: { restaurantId, name: c.name, emoji: c.emoji, position, active: true } })).id;
    }
    const positions: Record<string, number> = {};
    const next = (cat: string) => (positions[cat] = (positions[cat] ?? -1) + 1);
    await tx.menuItem.createMany({
      data: [
        ...template.recipes.map((r) => ({
          restaurantId, categoryId: menuCategoryId[r.menuCategory], name: r.name, description: r.description,
          price: r.price, recipeId: recipeId[r.key], position: next(r.menuCategory),
        })),
        ...template.resale.map((s) => ({
          restaurantId, categoryId: menuCategoryId[s.menuCategory], name: s.name, description: s.description,
          price: s.price, position: next(s.menuCategory),
        })),
      ],
    });

    // Two tables with a QR code, so the digital menu and the comanda have something to show
    const section = await tx.tableSection.create({
      data: { restaurantId, name: 'Salão principal', description: 'Área principal', capacity: 40 },
    });
    for (const [number, capacity] of [[1, 4], [2, 6]] as const) {
      await tx.table.create({
        data: { restaurantId, number, sectionId: section.id, capacity, description: 'Mesa de exemplo', qrToken: randomBytes(16).toString('hex') },
      });
    }
  }, { timeout: 20000 });

  return { seeded: true, template: template.slug };
}
