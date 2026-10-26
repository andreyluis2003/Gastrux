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

  it('espetaria counts its espetos and pão de alho in the daily count, nothing else', () => {
    const t = templateFor('espetaria');
    const counted = t.recipes.filter((r) => r.dailyCount).map((r) => r.key).sort();
    expect(counted).toEqual(['ALC', 'COR', 'FRG', 'KAF', 'LIN', 'PAO', 'QJC']);
    for (const r of t.recipes) expect([r.key, !!r.dailyCount]).toEqual([r.key, r.menuCategory === 'Espetos']);
  });

  // Owner, 2026-10-23: what was built for the espetaria serves the other segments too. What is prepared before it
  // is sold is counted; what is made to order is not
  it('the other segments count what they prepare in advance', () => {
    const counted = (slug: string) => templateFor(slug).recipes.filter((r) => r.dailyCount).map((r) => r.key).sort();
    expect(counted('lanchonete')).toEqual(['COX', 'ESF', 'KIB']);
    expect(counted('marmitaria')).toEqual(['CMO', 'FRG', 'LIN', 'MAC']);
    expect(counted('doceria')).toEqual(['BOL', 'BRI', 'MOR', 'MOU']);
    // Padaria and cafeteria (owner, 2026-10-23): the fornada and what goes in the display case are counted
    // The pão francês is sold by kg since 2026-10-25 (venda por peso): the count is of units, so it is out
    expect(counted('padaria')).toEqual(['BOL', 'COX', 'SON']);
    expect(counted('cafeteria')).toEqual(['BOL', 'PQJ']);
    for (const slug of ['restaurantes', 'pizzaria', 'hamburgueria', 'japones', 'acai', 'bar']) expect([slug, counted(slug)]).toEqual([slug, []]);
  });

  it('the padaria sells its pão francês by kg, with a ficha of 1 kg (spec 2026-10-25 venda-por-peso)', () => {
    const byWeight = (slug: string) => templateFor(slug).recipes.filter((r) => r.soldByWeight).map((r) => r.key);
    expect(byWeight('padaria')).toEqual(['PFR']);
    const pfr = templateFor('padaria').recipes.find((r) => r.key === 'PFR')!;
    expect(pfr.price).toBe(18.9);
    // About 0.6 kg of flour per kg of bread
    expect(pfr.items.find((i) => i.ingredient === 'FTR')!.qty).toBeCloseTo(0.6);
    for (const slug of ['restaurantes', 'cafeteria', 'lanchonete', 'espetaria']) expect([slug, byWeight(slug)]).toEqual([slug, []]);
  });

  // Revisão da lanchonete (spec 2026-10-26): combos, salgados de festa, refrigerante com estoque
  it('the lanchonete has combos and a cento for parties; the combo with coxinha counts as a coxinha', () => {
    const t = templateFor('lanchonete');
    expect(t.menuCategories.map((c) => c.name)).toEqual(['Lanches', 'Salgados', 'Combos', 'Para festas', 'Bebidas']);
    expect(t.recipes.filter((r) => r.menuCategory === 'Combos').length).toBeGreaterThanOrEqual(3);
    expect(t.recipes.find((r) => r.key === 'CXR')!.countsAs).toEqual([{ recipe: 'COX', qty: 1 }]);
    expect(t.recipes.filter((r) => r.menuCategory === 'Para festas').map((r) => r.key)).toEqual(['CEN']);
    // The can has its own insumo: the combo and the can sold alone take from the same stock
    expect(t.resale.map((s) => s.name)).not.toContain('Refrigerante lata');
    expect(t.recipes.find((r) => r.name === 'Refrigerante lata')!.items).toEqual([{ ingredient: 'REF', qty: 1, unit: 'un' }]);
  });

  for (const t of STARTER_TEMPLATES) {
    describe(t.slug, () => {
      it('"conta como" points at counted recipes of the template, never from a counted one or at itself', () => {
        for (const r of t.recipes.filter((x) => x.countsAs?.length)) {
          expect([r.key, !!r.dailyCount]).toEqual([r.key, false]);
          for (const p of r.countsAs!) {
            const part = t.recipes.find((x) => x.key === p.recipe);
            expect([r.key, p.recipe, !!part?.dailyCount, p.recipe !== r.key, Number.isInteger(p.qty) && p.qty >= 1]).toEqual([r.key, p.recipe, true, true, true]);
          }
        }
      });

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
