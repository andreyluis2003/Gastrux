import { SEGMENTS } from '../../lib/marketing/segments';
import { STARTER_TEMPLATES, templateFor, recipeCost } from '../../lib/onboarding/starter-templates';

const CATEGORIES = ['Carnes', 'Vegetais', 'Laticínios', 'Temperos', 'Bebidas', 'Outros'];

describe('starter templates ("Comece com", lib/onboarding/starter-templates.ts)', () => {
  it('one template for every business type the sign-up questions offer', () => {
    const offered = SEGMENTS.filter((s) => !['delivery', 'franquias'].includes(s.slug)).map((s) => s.slug).sort();
    expect(STARTER_TEMPLATES.map((t) => t.slug).sort()).toEqual(offered);
  });

  it('unknown or missing types fall back to the general restaurant template', () => {
    expect(templateFor(null).slug).toBe('restaurantes');
    expect(templateFor('nao-existe').slug).toBe('restaurantes');
    expect(templateFor('pizzaria').slug).toBe('pizzaria');
  });

  for (const t of STARTER_TEMPLATES) {
    describe(t.slug, () => {
      it('ingredient and recipe codes are unique, categories exist', () => {
        const ing = t.ingredients.map((i) => i.key);
        expect(new Set(ing).size).toBe(ing.length);
        const rec = t.recipes.map((r) => r.key);
        expect(new Set(rec).size).toBe(rec.length);
        for (const i of t.ingredients) expect(CATEGORIES).toContain(i.category);
      });

      it('every recipe line uses an ingredient of the template, in that ingredient\'s unit', () => {
        for (const r of t.recipes) {
          for (const item of r.items) {
            const ing = t.ingredients.find((i) => i.key === item.ingredient);
            expect([r.key, item.ingredient, !!ing]).toEqual([r.key, item.ingredient, true]);
            expect([r.key, item.ingredient, item.unit]).toEqual([r.key, item.ingredient, ing!.unit]);
            expect(item.qty).toBeGreaterThan(0);
          }
        }
      });

      it('every ingredient is used by some recipe', () => {
        const used = new Set(t.recipes.flatMap((r) => r.items.map((i) => i.ingredient)));
        expect(t.ingredients.filter((i) => !used.has(i.key)).map((i) => i.key)).toEqual([]);
      });

      it('each dish costs a realistic share of its price (CMV between 10% and 45%)', () => {
        for (const r of t.recipes) {
          const cmv = recipeCost(t, r) / r.price;
          expect([r.key, cmv >= 0.1 && cmv <= 0.45, Math.round(cmv * 100)]).toEqual([r.key, true, Math.round(cmv * 100)]);
        }
      });

      it('menu items point at categories of the template', () => {
        const cats = t.menuCategories.map((c) => c.name);
        for (const r of t.recipes) expect(cats).toContain(r.menuCategory);
        for (const s of t.resale) expect(cats).toContain(s.menuCategory);
      });
    });
  }
});
