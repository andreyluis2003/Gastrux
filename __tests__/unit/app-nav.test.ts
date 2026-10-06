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

  it('the owner sees the cash register, fiscal and reports, grouped by task', () => {
    const groups = navFor('OWNER', false);
    expect(groups.map((g) => g.id)).toEqual(['inicio', 'vender', 'caixa', 'cardapio', 'estoque', 'fiscal', 'relatorios', 'clientes', 'equipe', 'config']);
    expect(hrefs(groups)).toEqual(expect.arrayContaining(['/caixa', '/admin/fiscal', '/cmv', '/dashboard']));
  });

  it('a cashier sees only what the counter uses', () => {
    expect(hrefs(navFor('CASHIER', false))).toEqual(['/dashboard', '/comanda', '/admin/integrations/orders', '/caixa']);
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
    expect(shellMode('/cozinha')).toBe('drawer');
    for (const p of ['/dashboard', '/caixa', '/caixa/historico', '/admin/fiscal', '/insumos', '/estoque']) {
      expect([p, shellMode(p)]).toEqual([p, 'sidebar']);
    }
  });
});
