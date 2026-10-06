/**
 * "Comece com": the example menu a new account starts with, by business type (2026-10-06, owner's
 * choice after the competitor study: Anota AI and Consumer never start a restaurant from zero).
 * One template per business type the sign-up questions offer (lib/marketing/segments.ts, minus
 * delivery and franquias). Costs are REFERENCE values for the example, shown as such: the owner
 * replaces them with what they pay. Every recipe is one portion (baseYield 1), so quantities read
 * as "per dish". Checked by __tests__/unit/starter-templates.test.ts.
 */

export type TemplateUnit = 'kg' | 'g' | 'l' | 'ml' | 'un';
export type IngredientCategoryKey = 'Carnes' | 'Vegetais' | 'Laticínios' | 'Temperos' | 'Bebidas' | 'Outros';

export interface TemplateIngredient {
  key: string; // short code, stored as DEMO-<key>
  name: string;
  category: IngredientCategoryKey;
  unit: TemplateUnit;
  cost: number; // R$ per unit, reference only
}

export interface TemplateRecipe {
  key: string; // stored as DEMO-R-<key>
  name: string;
  description: string;
  menuCategory: string;
  price: number; // selling price, R$
  prepMinutes: number;
  items: Array<{ ingredient: string; qty: number; unit: TemplateUnit }>;
}

export interface TemplateResaleItem {
  name: string;
  description: string;
  menuCategory: string;
  price: number;
}

export interface StarterTemplate {
  slug: string;
  label: string;
  menuCategories: Array<{ name: string; emoji: string }>;
  ingredients: TemplateIngredient[];
  recipes: TemplateRecipe[];
  /** Items sold as bought (no recipe): drinks, mostly */
  resale: TemplateResaleItem[];
}

const DRINKS: TemplateResaleItem[] = [
  { name: 'Refrigerante lata', description: '350 ml', menuCategory: 'Bebidas', price: 6 },
  { name: 'Água mineral', description: '500 ml', menuCategory: 'Bebidas', price: 4 },
];

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    slug: 'restaurantes',
    label: 'Restaurante',
    menuCategories: [{ name: 'Pratos principais', emoji: '🍽️' }, { name: 'Acompanhamentos', emoji: '🥗' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'ARR', name: 'Arroz branco', category: 'Outros', unit: 'kg', cost: 6.5 },
      { key: 'FEI', name: 'Feijão carioca', category: 'Outros', unit: 'kg', cost: 8 },
      { key: 'FRG', name: 'Peito de frango', category: 'Carnes', unit: 'kg', cost: 18 },
      { key: 'ALC', name: 'Alcatra', category: 'Carnes', unit: 'kg', cost: 45 },
      { key: 'BAT', name: 'Batata', category: 'Vegetais', unit: 'kg', cost: 6 },
      { key: 'TOM', name: 'Tomate', category: 'Vegetais', unit: 'kg', cost: 7.5 },
      { key: 'CEB', name: 'Cebola', category: 'Vegetais', unit: 'kg', cost: 4 },
      { key: 'ALF', name: 'Alface crespa', category: 'Vegetais', unit: 'un', cost: 3 },
      { key: 'ALH', name: 'Alho', category: 'Temperos', unit: 'kg', cost: 30 },
      { key: 'OLE', name: 'Óleo de soja', category: 'Outros', unit: 'l', cost: 7 },
      { key: 'SAL', name: 'Sal refinado', category: 'Temperos', unit: 'kg', cost: 2.5 },
      { key: 'FAR', name: 'Farinha de mandioca', category: 'Outros', unit: 'kg', cost: 9 },
    ],
    recipes: [
      { key: 'EXE', name: 'Prato executivo de frango', description: 'Arroz, feijão, frango grelhado, salada e farofa', menuCategory: 'Pratos principais', price: 35, prepMinutes: 25,
        items: [{ ingredient: 'ARR', qty: 0.15, unit: 'kg' }, { ingredient: 'FEI', qty: 0.1, unit: 'kg' }, { ingredient: 'FRG', qty: 0.2, unit: 'kg' }, { ingredient: 'ALF', qty: 0.25, unit: 'un' }, { ingredient: 'TOM', qty: 0.05, unit: 'kg' }, { ingredient: 'FAR', qty: 0.03, unit: 'kg' }, { ingredient: 'OLE', qty: 0.02, unit: 'l' }, { ingredient: 'SAL', qty: 0.005, unit: 'kg' }] },
      { key: 'BIF', name: 'Bife acebolado', description: 'Alcatra acebolada com arroz, feijão e batata frita', menuCategory: 'Pratos principais', price: 45, prepMinutes: 25,
        items: [{ ingredient: 'ALC', qty: 0.2, unit: 'kg' }, { ingredient: 'CEB', qty: 0.08, unit: 'kg' }, { ingredient: 'ARR', qty: 0.15, unit: 'kg' }, { ingredient: 'FEI', qty: 0.1, unit: 'kg' }, { ingredient: 'BAT', qty: 0.15, unit: 'kg' }, { ingredient: 'OLE', qty: 0.05, unit: 'l' }, { ingredient: 'SAL', qty: 0.005, unit: 'kg' }] },
      { key: 'ARF', name: 'Arroz com feijão', description: 'Porção de arroz soltinho com feijão temperado', menuCategory: 'Acompanhamentos', price: 14, prepMinutes: 40,
        items: [{ ingredient: 'ARR', qty: 0.2, unit: 'kg' }, { ingredient: 'FEI', qty: 0.15, unit: 'kg' }, { ingredient: 'ALH', qty: 0.005, unit: 'kg' }, { ingredient: 'SAL', qty: 0.005, unit: 'kg' }] },
      { key: 'SAL', name: 'Salada da casa', description: 'Alface, tomate e cebola', menuCategory: 'Acompanhamentos', price: 12, prepMinutes: 10,
        items: [{ ingredient: 'ALF', qty: 0.5, unit: 'un' }, { ingredient: 'TOM', qty: 0.1, unit: 'kg' }, { ingredient: 'CEB', qty: 0.03, unit: 'kg' }] },
    ],
    resale: DRINKS,
  },
  {
    slug: 'pizzaria',
    label: 'Pizzaria',
    menuCategories: [{ name: 'Pizzas', emoji: '🍕' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'MAS', name: 'Massa de pizza (disco 35 cm)', category: 'Outros', unit: 'un', cost: 4.5 },
      { key: 'MOL', name: 'Molho de tomate', category: 'Outros', unit: 'kg', cost: 12 },
      { key: 'MUS', name: 'Muçarela', category: 'Laticínios', unit: 'kg', cost: 38 },
      { key: 'CAL', name: 'Calabresa', category: 'Carnes', unit: 'kg', cost: 28 },
      { key: 'PRE', name: 'Presunto', category: 'Carnes', unit: 'kg', cost: 30 },
      { key: 'FRD', name: 'Frango desfiado', category: 'Carnes', unit: 'kg', cost: 26 },
      { key: 'CAT', name: 'Requeijão cremoso', category: 'Laticínios', unit: 'kg', cost: 32 },
      { key: 'CEB', name: 'Cebola', category: 'Vegetais', unit: 'kg', cost: 4 },
      { key: 'TOM', name: 'Tomate', category: 'Vegetais', unit: 'kg', cost: 7.5 },
      { key: 'AZT', name: 'Azeitona', category: 'Outros', unit: 'kg', cost: 35 },
      { key: 'ORE', name: 'Orégano', category: 'Temperos', unit: 'kg', cost: 60 },
    ],
    recipes: [
      { key: 'MUS', name: 'Pizza muçarela', description: 'Molho, muçarela, tomate e orégano', menuCategory: 'Pizzas', price: 55, prepMinutes: 20,
        items: [{ ingredient: 'MAS', qty: 1, unit: 'un' }, { ingredient: 'MOL', qty: 0.12, unit: 'kg' }, { ingredient: 'MUS', qty: 0.3, unit: 'kg' }, { ingredient: 'TOM', qty: 0.08, unit: 'kg' }, { ingredient: 'ORE', qty: 0.002, unit: 'kg' }] },
      { key: 'CAL', name: 'Pizza calabresa', description: 'Calabresa fatiada, cebola e azeitona', menuCategory: 'Pizzas', price: 58, prepMinutes: 20,
        items: [{ ingredient: 'MAS', qty: 1, unit: 'un' }, { ingredient: 'MOL', qty: 0.12, unit: 'kg' }, { ingredient: 'MUS', qty: 0.15, unit: 'kg' }, { ingredient: 'CAL', qty: 0.2, unit: 'kg' }, { ingredient: 'CEB', qty: 0.06, unit: 'kg' }, { ingredient: 'AZT', qty: 0.03, unit: 'kg' }] },
      { key: 'POR', name: 'Pizza portuguesa', description: 'Presunto, muçarela, cebola e azeitona', menuCategory: 'Pizzas', price: 62, prepMinutes: 20,
        items: [{ ingredient: 'MAS', qty: 1, unit: 'un' }, { ingredient: 'MOL', qty: 0.12, unit: 'kg' }, { ingredient: 'MUS', qty: 0.2, unit: 'kg' }, { ingredient: 'PRE', qty: 0.12, unit: 'kg' }, { ingredient: 'CEB', qty: 0.05, unit: 'kg' }, { ingredient: 'AZT', qty: 0.03, unit: 'kg' }] },
      { key: 'FRC', name: 'Pizza frango com requeijão', description: 'Frango desfiado, requeijão e muçarela', menuCategory: 'Pizzas', price: 62, prepMinutes: 20,
        items: [{ ingredient: 'MAS', qty: 1, unit: 'un' }, { ingredient: 'MOL', qty: 0.1, unit: 'kg' }, { ingredient: 'MUS', qty: 0.15, unit: 'kg' }, { ingredient: 'FRD', qty: 0.2, unit: 'kg' }, { ingredient: 'CAT', qty: 0.1, unit: 'kg' }] },
    ],
    resale: [{ name: 'Refrigerante 2 litros', description: 'Garrafa', menuCategory: 'Bebidas', price: 14 }, ...DRINKS],
  },
  {
    slug: 'hamburgueria',
    label: 'Hamburgueria',
    menuCategories: [{ name: 'Burgers', emoji: '🍔' }, { name: 'Porções', emoji: '🍟' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'PAO', name: 'Pão brioche', category: 'Outros', unit: 'un', cost: 1.8 },
      { key: 'BLE', name: 'Blend bovino', category: 'Carnes', unit: 'kg', cost: 42 },
      { key: 'QCH', name: 'Queijo cheddar fatiado', category: 'Laticínios', unit: 'kg', cost: 48 },
      { key: 'BAC', name: 'Bacon', category: 'Carnes', unit: 'kg', cost: 40 },
      { key: 'ALF', name: 'Alface americana', category: 'Vegetais', unit: 'un', cost: 5 },
      { key: 'TOM', name: 'Tomate', category: 'Vegetais', unit: 'kg', cost: 7.5 },
      { key: 'CEB', name: 'Cebola roxa', category: 'Vegetais', unit: 'kg', cost: 6 },
      { key: 'MAI', name: 'Maionese da casa', category: 'Outros', unit: 'kg', cost: 18 },
      { key: 'BAT', name: 'Batata palito congelada', category: 'Vegetais', unit: 'kg', cost: 16 },
      { key: 'OLE', name: 'Óleo para fritura', category: 'Outros', unit: 'l', cost: 7 },
      { key: 'SAL', name: 'Sal refinado', category: 'Temperos', unit: 'kg', cost: 2.5 },
    ],
    recipes: [
      { key: 'CLA', name: 'Burger clássico', description: 'Blend 150 g, cheddar, alface, tomate e maionese da casa', menuCategory: 'Burgers', price: 32, prepMinutes: 12,
        items: [{ ingredient: 'PAO', qty: 1, unit: 'un' }, { ingredient: 'BLE', qty: 0.15, unit: 'kg' }, { ingredient: 'QCH', qty: 0.03, unit: 'kg' }, { ingredient: 'ALF', qty: 0.05, unit: 'un' }, { ingredient: 'TOM', qty: 0.03, unit: 'kg' }, { ingredient: 'MAI', qty: 0.02, unit: 'kg' }] },
      { key: 'BAC', name: 'Burger bacon', description: 'Blend 150 g, cheddar, bacon e cebola roxa', menuCategory: 'Burgers', price: 38, prepMinutes: 14,
        items: [{ ingredient: 'PAO', qty: 1, unit: 'un' }, { ingredient: 'BLE', qty: 0.15, unit: 'kg' }, { ingredient: 'QCH', qty: 0.03, unit: 'kg' }, { ingredient: 'BAC', qty: 0.04, unit: 'kg' }, { ingredient: 'CEB', qty: 0.02, unit: 'kg' }, { ingredient: 'MAI', qty: 0.02, unit: 'kg' }] },
      { key: 'DUP', name: 'Burger duplo', description: 'Dois blends de 120 g e cheddar em dobro', menuCategory: 'Burgers', price: 44, prepMinutes: 15,
        items: [{ ingredient: 'PAO', qty: 1, unit: 'un' }, { ingredient: 'BLE', qty: 0.24, unit: 'kg' }, { ingredient: 'QCH', qty: 0.06, unit: 'kg' }, { ingredient: 'MAI', qty: 0.02, unit: 'kg' }] },
      { key: 'FRI', name: 'Batata frita', description: 'Porção de 300 g', menuCategory: 'Porções', price: 22, prepMinutes: 8,
        items: [{ ingredient: 'BAT', qty: 0.3, unit: 'kg' }, { ingredient: 'OLE', qty: 0.05, unit: 'l' }, { ingredient: 'SAL', qty: 0.003, unit: 'kg' }] },
    ],
    resale: DRINKS,
  },
  {
    slug: 'japones',
    label: 'Japonês',
    menuCategories: [{ name: 'Sushis e combinados', emoji: '🍣' }, { name: 'Quentes', emoji: '🍜' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'ARJ', name: 'Arroz japonês', category: 'Outros', unit: 'kg', cost: 14 },
      { key: 'SAL', name: 'Salmão fresco', category: 'Carnes', unit: 'kg', cost: 85 },
      { key: 'KAN', name: 'Kani', category: 'Carnes', unit: 'kg', cost: 32 },
      { key: 'NOR', name: 'Alga nori', category: 'Outros', unit: 'un', cost: 1.2 },
      { key: 'CRE', name: 'Cream cheese', category: 'Laticínios', unit: 'kg', cost: 45 },
      { key: 'PEP', name: 'Pepino japonês', category: 'Vegetais', unit: 'kg', cost: 8 },
      { key: 'VIN', name: 'Vinagre de arroz', category: 'Temperos', unit: 'l', cost: 12 },
      { key: 'SHO', name: 'Shoyu', category: 'Temperos', unit: 'l', cost: 15 },
      { key: 'FAR', name: 'Farinha panko', category: 'Outros', unit: 'kg', cost: 22 },
      { key: 'OLE', name: 'Óleo para fritura', category: 'Outros', unit: 'l', cost: 7 },
      { key: 'YAK', name: 'Macarrão para yakisoba', category: 'Outros', unit: 'kg', cost: 16 },
      { key: 'LEG', name: 'Legumes mistos', category: 'Vegetais', unit: 'kg', cost: 12 },
    ],
    recipes: [
      { key: 'COM', name: 'Combinado 20 peças', description: 'Sashimi, niguiri, uramaki e hossomaki', menuCategory: 'Sushis e combinados', price: 79, prepMinutes: 20,
        items: [{ ingredient: 'ARJ', qty: 0.25, unit: 'kg' }, { ingredient: 'SAL', qty: 0.25, unit: 'kg' }, { ingredient: 'KAN', qty: 0.05, unit: 'kg' }, { ingredient: 'NOR', qty: 2, unit: 'un' }, { ingredient: 'CRE', qty: 0.04, unit: 'kg' }, { ingredient: 'PEP', qty: 0.04, unit: 'kg' }, { ingredient: 'VIN', qty: 0.02, unit: 'l' }] },
      { key: 'URA', name: 'Uramaki salmão (8 peças)', description: 'Salmão e cream cheese', menuCategory: 'Sushis e combinados', price: 34, prepMinutes: 10,
        items: [{ ingredient: 'ARJ', qty: 0.12, unit: 'kg' }, { ingredient: 'SAL', qty: 0.08, unit: 'kg' }, { ingredient: 'CRE', qty: 0.03, unit: 'kg' }, { ingredient: 'NOR', qty: 1, unit: 'un' }, { ingredient: 'VIN', qty: 0.01, unit: 'l' }] },
      { key: 'HOT', name: 'Hot roll (10 peças)', description: 'Salmão e cream cheese empanados', menuCategory: 'Sushis e combinados', price: 36, prepMinutes: 12,
        items: [{ ingredient: 'ARJ', qty: 0.12, unit: 'kg' }, { ingredient: 'SAL', qty: 0.07, unit: 'kg' }, { ingredient: 'CRE', qty: 0.04, unit: 'kg' }, { ingredient: 'NOR', qty: 1, unit: 'un' }, { ingredient: 'FAR', qty: 0.04, unit: 'kg' }, { ingredient: 'OLE', qty: 0.1, unit: 'l' }] },
      { key: 'YAK', name: 'Yakisoba de legumes', description: 'Macarrão salteado com legumes e shoyu', menuCategory: 'Quentes', price: 38, prepMinutes: 15,
        items: [{ ingredient: 'YAK', qty: 0.15, unit: 'kg' }, { ingredient: 'LEG', qty: 0.2, unit: 'kg' }, { ingredient: 'SHO', qty: 0.04, unit: 'l' }, { ingredient: 'OLE', qty: 0.02, unit: 'l' }] },
    ],
    resale: DRINKS,
  },
  {
    slug: 'lanchonete',
    label: 'Lanchonete',
    menuCategories: [{ name: 'Lanches', emoji: '🥪' }, { name: 'Salgados', emoji: '🥟' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'PFR', name: 'Pão francês', category: 'Outros', unit: 'un', cost: 0.8 },
      { key: 'PFO', name: 'Pão de forma', category: 'Outros', unit: 'un', cost: 0.5 },
      { key: 'PRE', name: 'Presunto', category: 'Carnes', unit: 'kg', cost: 30 },
      { key: 'MUS', name: 'Muçarela', category: 'Laticínios', unit: 'kg', cost: 38 },
      { key: 'OVO', name: 'Ovo', category: 'Outros', unit: 'un', cost: 0.9 },
      { key: 'MAN', name: 'Manteiga', category: 'Laticínios', unit: 'kg', cost: 45 },
      { key: 'COX', name: 'Coxinha congelada', category: 'Outros', unit: 'un', cost: 2.2 },
      { key: 'OLE', name: 'Óleo para fritura', category: 'Outros', unit: 'l', cost: 7 },
      { key: 'LAR', name: 'Laranja', category: 'Vegetais', unit: 'kg', cost: 4 },
      { key: 'CAF', name: 'Café em pó', category: 'Bebidas', unit: 'kg', cost: 45 },
      { key: 'LEI', name: 'Leite', category: 'Laticínios', unit: 'l', cost: 5.5 },
    ],
    recipes: [
      { key: 'MIS', name: 'Misto quente', description: 'Pão de forma, presunto e muçarela na chapa', menuCategory: 'Lanches', price: 12, prepMinutes: 5,
        items: [{ ingredient: 'PFO', qty: 2, unit: 'un' }, { ingredient: 'PRE', qty: 0.04, unit: 'kg' }, { ingredient: 'MUS', qty: 0.04, unit: 'kg' }, { ingredient: 'MAN', qty: 0.01, unit: 'kg' }] },
      { key: 'PAN', name: 'Pão na chapa', description: 'Pão francês com manteiga', menuCategory: 'Lanches', price: 6, prepMinutes: 3,
        items: [{ ingredient: 'PFR', qty: 1, unit: 'un' }, { ingredient: 'MAN', qty: 0.015, unit: 'kg' }] },
      { key: 'OVO', name: 'Pão com ovo e queijo', description: 'Pão francês, ovo e muçarela', menuCategory: 'Lanches', price: 11, prepMinutes: 5,
        items: [{ ingredient: 'PFR', qty: 1, unit: 'un' }, { ingredient: 'OVO', qty: 1, unit: 'un' }, { ingredient: 'MUS', qty: 0.03, unit: 'kg' }, { ingredient: 'MAN', qty: 0.005, unit: 'kg' }] },
      { key: 'COX', name: 'Coxinha', description: 'Frita na hora', menuCategory: 'Salgados', price: 8, prepMinutes: 6,
        items: [{ ingredient: 'COX', qty: 1, unit: 'un' }, { ingredient: 'OLE', qty: 0.02, unit: 'l' }] },
      { key: 'SUC', name: 'Suco de laranja', description: '300 ml, feito na hora', menuCategory: 'Bebidas', price: 9, prepMinutes: 3,
        items: [{ ingredient: 'LAR', qty: 0.6, unit: 'kg' }] },
      { key: 'CAF', name: 'Café com leite', description: 'Xícara grande', menuCategory: 'Bebidas', price: 6, prepMinutes: 2,
        items: [{ ingredient: 'CAF', qty: 0.01, unit: 'kg' }, { ingredient: 'LEI', qty: 0.15, unit: 'l' }] },
    ],
    resale: DRINKS,
  },
  {
    slug: 'doceria',
    label: 'Doceria',
    menuCategories: [{ name: 'Bolos e fatias', emoji: '🍰' }, { name: 'Doces', emoji: '🧁' }, { name: 'Bebidas', emoji: '☕' }],
    ingredients: [
      { key: 'FTR', name: 'Farinha de trigo', category: 'Outros', unit: 'kg', cost: 5.5 },
      { key: 'ACU', name: 'Açúcar refinado', category: 'Outros', unit: 'kg', cost: 5 },
      { key: 'OVO', name: 'Ovo', category: 'Outros', unit: 'un', cost: 0.9 },
      { key: 'MAN', name: 'Manteiga', category: 'Laticínios', unit: 'kg', cost: 45 },
      { key: 'LEI', name: 'Leite', category: 'Laticínios', unit: 'l', cost: 5.5 },
      { key: 'LCO', name: 'Leite condensado', category: 'Laticínios', unit: 'kg', cost: 18 },
      { key: 'CHO', name: 'Chocolate em pó 50%', category: 'Outros', unit: 'kg', cost: 38 },
      { key: 'CRE', name: 'Creme de leite', category: 'Laticínios', unit: 'kg', cost: 20 },
      { key: 'MOR', name: 'Morango', category: 'Vegetais', unit: 'kg', cost: 25 },
      { key: 'GRA', name: 'Granulado', category: 'Outros', unit: 'kg', cost: 30 },
      { key: 'CAF', name: 'Café em pó', category: 'Bebidas', unit: 'kg', cost: 45 },
    ],
    recipes: [
      { key: 'BOL', name: 'Fatia de bolo de chocolate', description: 'Massa de chocolate com cobertura de brigadeiro', menuCategory: 'Bolos e fatias', price: 14, prepMinutes: 5,
        items: [{ ingredient: 'FTR', qty: 0.04, unit: 'kg' }, { ingredient: 'ACU', qty: 0.03, unit: 'kg' }, { ingredient: 'OVO', qty: 0.5, unit: 'un' }, { ingredient: 'CHO', qty: 0.02, unit: 'kg' }, { ingredient: 'LCO', qty: 0.04, unit: 'kg' }, { ingredient: 'MAN', qty: 0.01, unit: 'kg' }] },
      { key: 'BRI', name: 'Brigadeiro', description: 'Unidade', menuCategory: 'Doces', price: 4, prepMinutes: 2,
        items: [{ ingredient: 'LCO', qty: 0.02, unit: 'kg' }, { ingredient: 'CHO', qty: 0.003, unit: 'kg' }, { ingredient: 'MAN', qty: 0.001, unit: 'kg' }, { ingredient: 'GRA', qty: 0.003, unit: 'kg' }] },
      { key: 'MOU', name: 'Mousse de chocolate', description: 'Pote de 150 g', menuCategory: 'Doces', price: 12, prepMinutes: 5,
        items: [{ ingredient: 'CHO', qty: 0.03, unit: 'kg' }, { ingredient: 'CRE', qty: 0.06, unit: 'kg' }, { ingredient: 'LCO', qty: 0.04, unit: 'kg' }] },
      { key: 'MOR', name: 'Bolo de pote de morango', description: 'Massa branca, creme e morango', menuCategory: 'Doces', price: 15, prepMinutes: 5,
        items: [{ ingredient: 'FTR', qty: 0.03, unit: 'kg' }, { ingredient: 'ACU', qty: 0.02, unit: 'kg' }, { ingredient: 'OVO', qty: 0.3, unit: 'un' }, { ingredient: 'CRE', qty: 0.05, unit: 'kg' }, { ingredient: 'LCO', qty: 0.04, unit: 'kg' }, { ingredient: 'MOR', qty: 0.05, unit: 'kg' }] },
      { key: 'CAF', name: 'Café com leite', description: 'Xícara grande', menuCategory: 'Bebidas', price: 6, prepMinutes: 2,
        items: [{ ingredient: 'CAF', qty: 0.01, unit: 'kg' }, { ingredient: 'LEI', qty: 0.1, unit: 'l' }] },
    ],
    resale: [{ name: 'Água mineral', description: '500 ml', menuCategory: 'Bebidas', price: 4 }],
  },
  {
    slug: 'marmitaria',
    label: 'Marmitaria',
    menuCategories: [{ name: 'Marmitas', emoji: '🍱' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'ARR', name: 'Arroz branco', category: 'Outros', unit: 'kg', cost: 6.5 },
      { key: 'FEI', name: 'Feijão carioca', category: 'Outros', unit: 'kg', cost: 8 },
      { key: 'FRG', name: 'Peito de frango', category: 'Carnes', unit: 'kg', cost: 18 },
      { key: 'CMO', name: 'Carne moída', category: 'Carnes', unit: 'kg', cost: 32 },
      { key: 'LIN', name: 'Linguiça toscana', category: 'Carnes', unit: 'kg', cost: 24 },
      { key: 'MAC', name: 'Macarrão', category: 'Outros', unit: 'kg', cost: 7 },
      { key: 'BAT', name: 'Batata', category: 'Vegetais', unit: 'kg', cost: 6 },
      { key: 'CEN', name: 'Cenoura', category: 'Vegetais', unit: 'kg', cost: 5 },
      { key: 'ALF', name: 'Alface crespa', category: 'Vegetais', unit: 'un', cost: 3 },
      { key: 'OLE', name: 'Óleo de soja', category: 'Outros', unit: 'l', cost: 7 },
      { key: 'SAL', name: 'Sal refinado', category: 'Temperos', unit: 'kg', cost: 2.5 },
      { key: 'EMB', name: 'Embalagem marmita com tampa', category: 'Outros', unit: 'un', cost: 1.1 },
    ],
    recipes: [
      { key: 'FRG', name: 'Marmita de frango', description: 'Arroz, feijão, frango grelhado, legumes e salada', menuCategory: 'Marmitas', price: 25, prepMinutes: 10,
        items: [{ ingredient: 'ARR', qty: 0.15, unit: 'kg' }, { ingredient: 'FEI', qty: 0.1, unit: 'kg' }, { ingredient: 'FRG', qty: 0.15, unit: 'kg' }, { ingredient: 'CEN', qty: 0.05, unit: 'kg' }, { ingredient: 'ALF', qty: 0.15, unit: 'un' }, { ingredient: 'OLE', qty: 0.02, unit: 'l' }, { ingredient: 'EMB', qty: 1, unit: 'un' }] },
      { key: 'CMO', name: 'Marmita de carne moída', description: 'Arroz, feijão, carne moída com batata', menuCategory: 'Marmitas', price: 26, prepMinutes: 10,
        items: [{ ingredient: 'ARR', qty: 0.15, unit: 'kg' }, { ingredient: 'FEI', qty: 0.1, unit: 'kg' }, { ingredient: 'CMO', qty: 0.13, unit: 'kg' }, { ingredient: 'BAT', qty: 0.08, unit: 'kg' }, { ingredient: 'OLE', qty: 0.02, unit: 'l' }, { ingredient: 'EMB', qty: 1, unit: 'un' }] },
      { key: 'LIN', name: 'Marmita de linguiça', description: 'Arroz, feijão, linguiça acebolada e salada', menuCategory: 'Marmitas', price: 24, prepMinutes: 10,
        items: [{ ingredient: 'ARR', qty: 0.15, unit: 'kg' }, { ingredient: 'FEI', qty: 0.1, unit: 'kg' }, { ingredient: 'LIN', qty: 0.15, unit: 'kg' }, { ingredient: 'ALF', qty: 0.15, unit: 'un' }, { ingredient: 'EMB', qty: 1, unit: 'un' }] },
      { key: 'MAC', name: 'Marmita de macarrão à bolonhesa', description: 'Macarrão com molho de carne moída', menuCategory: 'Marmitas', price: 24, prepMinutes: 10,
        items: [{ ingredient: 'MAC', qty: 0.15, unit: 'kg' }, { ingredient: 'CMO', qty: 0.1, unit: 'kg' }, { ingredient: 'SAL', qty: 0.003, unit: 'kg' }, { ingredient: 'EMB', qty: 1, unit: 'un' }] },
    ],
    resale: DRINKS,
  },
  {
    slug: 'acai',
    label: 'Açaí',
    menuCategories: [{ name: 'Açaí', emoji: '🫐' }, { name: 'Adicionais', emoji: '🍓' }, { name: 'Bebidas', emoji: '🥤' }],
    ingredients: [
      { key: 'ACA', name: 'Polpa de açaí', category: 'Outros', unit: 'kg', cost: 22 },
      { key: 'GRA', name: 'Granola', category: 'Outros', unit: 'kg', cost: 25 },
      { key: 'BAN', name: 'Banana', category: 'Vegetais', unit: 'kg', cost: 6 },
      { key: 'MOR', name: 'Morango', category: 'Vegetais', unit: 'kg', cost: 25 },
      { key: 'LPO', name: 'Leite em pó', category: 'Laticínios', unit: 'kg', cost: 40 },
      { key: 'LCO', name: 'Leite condensado', category: 'Laticínios', unit: 'kg', cost: 18 },
      { key: 'PAC', name: 'Paçoca', category: 'Outros', unit: 'kg', cost: 30 },
      { key: 'COP', name: 'Copo 300 ml com tampa', category: 'Outros', unit: 'un', cost: 0.6 },
      { key: 'COG', name: 'Copo 500 ml com tampa', category: 'Outros', unit: 'un', cost: 0.8 },
    ],
    recipes: [
      { key: '300', name: 'Açaí 300 ml', description: 'Com granola e banana', menuCategory: 'Açaí', price: 16, prepMinutes: 3,
        items: [{ ingredient: 'ACA', qty: 0.25, unit: 'kg' }, { ingredient: 'GRA', qty: 0.02, unit: 'kg' }, { ingredient: 'BAN', qty: 0.05, unit: 'kg' }, { ingredient: 'COP', qty: 1, unit: 'un' }] },
      { key: '500', name: 'Açaí 500 ml', description: 'Com granola, banana e leite condensado', menuCategory: 'Açaí', price: 28, prepMinutes: 4,
        items: [{ ingredient: 'ACA', qty: 0.42, unit: 'kg' }, { ingredient: 'GRA', qty: 0.03, unit: 'kg' }, { ingredient: 'BAN', qty: 0.08, unit: 'kg' }, { ingredient: 'LCO', qty: 0.03, unit: 'kg' }, { ingredient: 'COG', qty: 1, unit: 'un' }] },
      { key: 'MOR', name: 'Adicional de morango', description: 'Porção de 50 g', menuCategory: 'Adicionais', price: 4, prepMinutes: 1,
        items: [{ ingredient: 'MOR', qty: 0.05, unit: 'kg' }] },
      { key: 'LPO', name: 'Adicional de leite em pó', description: 'Porção de 20 g', menuCategory: 'Adicionais', price: 3, prepMinutes: 1,
        items: [{ ingredient: 'LPO', qty: 0.02, unit: 'kg' }] },
      { key: 'PAC', name: 'Adicional de paçoca', description: 'Porção de 20 g', menuCategory: 'Adicionais', price: 3, prepMinutes: 1,
        items: [{ ingredient: 'PAC', qty: 0.02, unit: 'kg' }] },
    ],
    resale: [{ name: 'Água mineral', description: '500 ml', menuCategory: 'Bebidas', price: 4 }],
  },
  {
    slug: 'bar',
    label: 'Bar & Pub',
    menuCategories: [{ name: 'Petiscos', emoji: '🍢' }, { name: 'Drinks', emoji: '🍹' }, { name: 'Bebidas', emoji: '🍺' }],
    ingredients: [
      { key: 'BAT', name: 'Batata palito congelada', category: 'Vegetais', unit: 'kg', cost: 16 },
      { key: 'FRA', name: 'Frango a passarinho (cortes)', category: 'Carnes', unit: 'kg', cost: 16 },
      { key: 'CAL', name: 'Calabresa', category: 'Carnes', unit: 'kg', cost: 28 },
      { key: 'CEB', name: 'Cebola', category: 'Vegetais', unit: 'kg', cost: 4 },
      { key: 'ALH', name: 'Alho', category: 'Temperos', unit: 'kg', cost: 30 },
      { key: 'OLE', name: 'Óleo para fritura', category: 'Outros', unit: 'l', cost: 7 },
      { key: 'LIM', name: 'Limão taiti', category: 'Vegetais', unit: 'kg', cost: 5 },
      { key: 'CAC', name: 'Cachaça', category: 'Bebidas', unit: 'l', cost: 30 },
      { key: 'ACU', name: 'Açúcar refinado', category: 'Outros', unit: 'kg', cost: 5 },
      { key: 'GEL', name: 'Gelo', category: 'Bebidas', unit: 'kg', cost: 2 },
      { key: 'SAL', name: 'Sal refinado', category: 'Temperos', unit: 'kg', cost: 2.5 },
    ],
    recipes: [
      { key: 'FRI', name: 'Porção de batata frita', description: '500 g', menuCategory: 'Petiscos', price: 32, prepMinutes: 10,
        items: [{ ingredient: 'BAT', qty: 0.5, unit: 'kg' }, { ingredient: 'OLE', qty: 0.08, unit: 'l' }, { ingredient: 'SAL', qty: 0.004, unit: 'kg' }] },
      { key: 'FRA', name: 'Frango a passarinho', description: 'Porção de 500 g com alho frito', menuCategory: 'Petiscos', price: 45, prepMinutes: 20,
        items: [{ ingredient: 'FRA', qty: 0.6, unit: 'kg' }, { ingredient: 'ALH', qty: 0.02, unit: 'kg' }, { ingredient: 'OLE', qty: 0.1, unit: 'l' }, { ingredient: 'SAL', qty: 0.005, unit: 'kg' }] },
      { key: 'CAL', name: 'Calabresa acebolada', description: 'Porção de 400 g', menuCategory: 'Petiscos', price: 38, prepMinutes: 12,
        items: [{ ingredient: 'CAL', qty: 0.4, unit: 'kg' }, { ingredient: 'CEB', qty: 0.15, unit: 'kg' }, { ingredient: 'OLE', qty: 0.02, unit: 'l' }] },
      { key: 'CAI', name: 'Caipirinha de limão', description: 'Cachaça, limão, açúcar e gelo', menuCategory: 'Drinks', price: 22, prepMinutes: 4,
        items: [{ ingredient: 'CAC', qty: 0.06, unit: 'l' }, { ingredient: 'LIM', qty: 0.1, unit: 'kg' }, { ingredient: 'ACU', qty: 0.02, unit: 'kg' }, { ingredient: 'GEL', qty: 0.15, unit: 'kg' }] },
    ],
    resale: [{ name: 'Cerveja long neck', description: '355 ml', menuCategory: 'Bebidas', price: 12 }, ...DRINKS],
  },
];

/** The template for a business type; unknown or missing types get the general restaurant one */
export function templateFor(slug: string | null | undefined): StarterTemplate {
  return STARTER_TEMPLATES.find((t) => t.slug === slug) ?? STARTER_TEMPLATES[0];
}

/** Cost of one portion of a recipe from the template's own reference costs */
export function recipeCost(template: StarterTemplate, recipe: TemplateRecipe): number {
  return recipe.items.reduce((sum, item) => {
    const ing = template.ingredients.find((i) => i.key === item.ingredient);
    return sum + (ing ? ing.cost * item.qty : 0);
  }, 0);
}
