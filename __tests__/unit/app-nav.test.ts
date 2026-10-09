import * as fs from 'fs';
import * as path from 'path';
import { NAV_GROUPS, navFor, activeHref, shellMode } from '../../lib/navigation/app-nav';

const hrefs = (groups: ReturnType<typeof navFor>) => groups.flatMap((g) => g.links.map((l) => l.href));

describe('one navigation for the whole app (lib/navigation/app-nav.ts)', () => {
  it('every link opens a page that exists (no 404 in the menu)', () => {
    const missing = NAV_GROUPS.flatMap((g) => g.links)
      .map((l) => l.href.split('#')[0])
      .filter((href) => !fs.existsSync(path.join(__dirname, '../../app', href, 'page.tsx')));
    expect(missing).toEqual([]);
  });

  it('Etiquetas and Validades: owner, manager and cook, not the cashier (spec 2026-10-09 etiquetas)', () => {
    for (const role of ['OWNER', 'MANAGER', 'COOK']) expect(hrefs(navFor(role, false))).toEqual(expect.arrayContaining(['/etiquetas', '/etiquetas/validades']));
    expect(hrefs(navFor('CASHIER', false))).not.toContain('/etiquetas');
  });

  // The menu opened only the price panel, which cannot add a supplier (2026-10-09)
  it('Fornecedores opens the supplier register', () => {
    const link = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.label === 'Fornecedores');
    expect(link?.href).toBe('/fornecedores');
    // The cook registers suppliers too; the cashier does not (owner decision 2026-10-09)
    expect(hrefs(navFor('COOK', false))).toContain('/fornecedores');
    expect(hrefs(navFor('CASHIER', false))).not.toContain('/fornecedores');
  });

  it('the owner sees the cash register, fiscal and reports, grouped by task', () => {
    const groups = navFor('OWNER', false);
    expect(groups.map((g) => g.id)).toEqual(['inicio', 'vender', 'caixa', 'cardapio', 'estoque', 'fiscal', 'relatorios', 'clientes', 'equipe', 'config']);
    expect(hrefs(groups)).toEqual(expect.arrayContaining(['/caixa', '/admin/fiscal', '/cmv', '/dashboard']));
  });

  it('a cashier sees only what the counter uses', () => {
    expect(hrefs(navFor('CASHIER', false))).toEqual(['/dashboard', '/vender', '/admin/integrations/orders', '/caixa']);
  });

  it('a cook sees recipes and stock, not money', () => {
    const h = hrefs(navFor('COOK', false));
    expect(h).toEqual(expect.arrayContaining(['/cozinha', '/receitas', '/estoque', '/contagem']));
    expect(h).not.toContain('/caixa');
    expect(h).not.toContain('/admin/fiscal');
    expect(h).not.toContain('/dashboard/pagamentos');
  });

  it('platform screens only for Gastrux staff', () => {
    expect(navFor('OWNER', false).some((g) => g.id === 'plataforma')).toBe(false);
    expect(navFor('ADMIN', true).some((g) => g.id === 'plataforma')).toBe(true);
  });

  it('highlights the most specific link', () => {
    const groups = navFor('OWNER', false);
    expect(activeHref(groups, '/caixa/historico')).toBe('/caixa/historico');
    expect(activeHref(groups, '/caixa')).toBe('/caixa');
    expect(activeHref(groups, '/dashboard/financeiro/dre')).toBe('/dashboard/financeiro/dre');
    expect(activeHref(groups, '/dashboard')).toBe('/dashboard');
  });

  it('the menu stays off public pages and is a drawer on full-screen operation', () => {
    for (const p of ['/', '/auth/signin', '/auth/qualification', '/delivery/abc', '/menu/x', '/imprimir/cozinha', '/pricing', '/para/pizzaria']) {
      expect([p, shellMode(p)]).toEqual([p, 'none']);
    }
    expect(shellMode('/comanda')).toBe('drawer');
    expect(shellMode('/vender')).toBe('drawer');
    expect(shellMode('/vender/abc')).toBe('drawer');
    expect(shellMode('/cozinha')).toBe('drawer');
    for (const p of ['/dashboard', '/caixa', '/caixa/historico', '/admin/fiscal', '/insumos', '/estoque']) {
      expect([p, shellMode(p)]).toEqual([p, 'sidebar']);
    }
  });
});

describe('floating helpers on full-screen operation (homolog check of tela Vender, 2026-10-07)', () => {
  const { showsAssistant, toastPosition } = require('../../lib/navigation/app-nav');
  it('the assistant bubble stays off the sales, comanda and kitchen screens (it covered "Lançar")', () => {
    expect(showsAssistant('/vender')).toBe(false);
    expect(showsAssistant('/vender/abc')).toBe(false);
    expect(showsAssistant('/cozinha')).toBe(false);
    expect(showsAssistant('/dashboard')).toBe(true);
    expect(showsAssistant('/')).toBe(false);
    expect(showsAssistant('/pricing')).toBe(false);
  });
  it('toasts go to the top there, so they never cover the bottom bar', () => {
    expect(toastPosition('/vender/abc')).toBe('top-center');
    expect(toastPosition('/dashboard')).toBe('bottom-right');
  });
});
