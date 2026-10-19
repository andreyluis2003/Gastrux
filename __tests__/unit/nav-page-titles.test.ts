/**
 * The same name everywhere (2026-10-18 UX research, proposal 2): the menu label is the title of the page it opens.
 * Each entry says where that title is written; a page whose title comes from translations names its key.
 */
import fs from 'fs';
import path from 'path';
import { NAV_GROUPS } from '@/lib/navigation/app-nav';

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const TR = 'lib/i18n/translations.ts';

// href -> [file, text that must be in it]; the text is the menu label unless the title is a translation key
const TITLE: Record<string, [string, string?]> = {
  '/admin/tables': ['app/admin/tables/page.tsx'],
  '/admin/integrations/orders': ['app/admin/integrations/orders/page.tsx'],
  '/caixa': ['app/caixa/page.tsx'],
  '/caixa/historico': ['app/caixa/historico/page.tsx'],
  '/dashboard/pagamentos': ['app/dashboard/pagamentos/page.tsx'],
  '/contas-a-pagar': ['app/contas-a-pagar/page.tsx'],
  '/admin/cardapio': ['app/admin/cardapio/page.tsx'],
  '/receitas': [TR, "'recipes.title': 'Fichas técnicas'"],
  '/insumos': [TR, "'ingredients.title': 'Insumos'"],
  '/admin/tables/qrcodes': ['app/admin/tables/qrcodes/page.tsx'],
  '/estoque': [TR, "'stock.title': 'Estoque'"],
  '/contagem': ['app/contagem/page.tsx'],
  '/compras': [TR, "'shopping.title': 'Compras'"],
  '/desperdicio': ['app/desperdicio/page.tsx'],
  '/fornecedores': ['app/fornecedores/page.tsx'],
  '/admin/nfe-import': ['app/admin/nfe-import/page.tsx'],
  '/admin/fiscal': ['app/admin/fiscal/page.tsx'],
  '/admin/nfe/documents': ['app/admin/nfe/documents/page.tsx'],
  '/cmv': ['app/cmv/page.tsx'],
  '/dashboard/reports/sales': ['app/dashboard/reports/sales/page.tsx'],
  '/dashboard/reports/profitability': ['app/dashboard/reports/profitability/page.tsx'],
  '/dashboard/financeiro': ['app/dashboard/financeiro/page.tsx'],
  '/dashboard/financeiro/contas': ['app/dashboard/financeiro/contas/page.tsx'],
  '/relatorios': ['app/relatorios/page.tsx'],
  '/dashboard/crm': ['app/dashboard/crm/page.tsx'],
  '/dashboard/loyalty': ['app/dashboard/loyalty/page.tsx'],
  '/admin/cashback': ['app/admin/cashback/page.tsx'],
  '/admin/messaging/campaigns': ['app/admin/messaging/campaigns/page.tsx'],
  '/admin/delivery-site': ['app/admin/delivery-site/page.tsx'],
  '/admin/staff': ['app/admin/staff/page.tsx'],
  '/planejamento': [TR, "'planning.title': 'Planejamento de produção'"],
  '/etiquetas': ['app/etiquetas/page.tsx'],
  '/etiquetas/validades': ['app/etiquetas/validades/page.tsx'],
  '/engenharia-cardapio': ['app/engenharia-cardapio/page.tsx'],
  '/dashboard/financeiro/dre': ['app/dashboard/financeiro/dre/page.tsx'],
  '/admin/staff/shifts': ['app/admin/staff/shifts/page.tsx'],
  '/admin/staff/commissions': ['app/admin/staff/commissions/page.tsx'],
  '/admin/settings': ['app/admin/settings/page.tsx'],
  '/dashboard/billing': [TR, "'billing.title': 'Minha assinatura'"],
  '/admin/integrations/whatsapp': ['app/admin/integrations/whatsapp/page.tsx'],
  '/admin/multi-location': ['app/admin/multi-location/page.tsx'],
  '/admin/settings/ia': ['app/admin/settings/ia/page.tsx'],
};
// Titles that are not a fixed text: the Início header, the sales screen (no title), the night count (from its board),
// the kitchen screen (its own header)
const NO_FIXED_TITLE = new Set(['/dashboard', '/vender', '/contagem-do-dia', '/cozinha']);

const restaurantLinks = NAV_GROUPS.filter((g) => !g.platformOnly).flatMap((g) => g.links);

it.each(restaurantLinks.filter((l) => !NO_FIXED_TITLE.has(l.href)).map((l) => [l.label, l.href]))('%s: the page title is the menu label', (label, href) => {
  const entry = TITLE[href];
  expect([href, !!entry]).toEqual([href, true]);
  const [file, text] = entry;
  const src = read(file);
  if (text) expect(src).toContain(text);
  else expect(src).toMatch(new RegExp(`<h1[^>]*>(?:\\s|<[^>]+/>|<[A-Za-z]+[^>]*/>)*${label.replace(/[()]/g, '\\$&')}\\s*</h1>|<h1[^>]*>[\\s\\S]{0,160}?\\n\\s*${label.replace(/[()]/g, '\\$&')}\\n\\s*</h1>`));
});

it('stock count and night count have different names', () => {
  const labels = restaurantLinks.map((l) => l.label);
  expect(labels).toContain('Contagem de estoque');
  expect(labels).toContain('Contagem do dia');
  expect(labels).not.toContain('Contagem');
});

it('the main buttons say what they create', () => {
  expect(read(TR)).toContain("'recipes.new': 'Nova ficha técnica'");
  expect(read('app/receitas/nova/page.tsx')).toContain('>Nova ficha técnica</h1>');
  expect(read(TR)).toContain("'stock.registerMovement': 'Registrar entrada ou saída'");
});
