import { entryRedirect, safeCallback } from '../../lib/navigation/entry';

describe('logged-in people go straight to work (lib/navigation/entry.ts)', () => {
  it('site, login and sign-up send a logged-in person to the dashboard', () => {
    expect(entryRedirect('/', null, true)).toBe('/dashboard');
    expect(entryRedirect('/auth/signin', null, true)).toBe('/dashboard');
    expect(entryRedirect('/auth/signup', null, true)).toBe('/dashboard');
  });

  it('the page they were trying to open wins', () => {
    expect(entryRedirect('/auth/signin', '/caixa', true)).toBe('/caixa');
    expect(entryRedirect('/auth/signin', '/admin/fiscal?tab=documents', true)).toBe('/admin/fiscal?tab=documents');
  });

  it('never to another site', () => {
    expect(entryRedirect('/auth/signin', '//evil.com', true)).toBe('/dashboard');
    expect(entryRedirect('/auth/signin', 'https://evil.com', true)).toBe('/dashboard');
    expect(safeCallback('/\\evil.com')).toBeNull();
    // Browsers drop tabs and newlines: these would become //evil.com
    expect(safeCallback('/\t/evil.com')).toBeNull();
    expect(safeCallback('/\n/evil.com')).toBeNull();
    expect(safeCallback('/%2F/evil.com')).not.toMatch(/^\/\//);
    expect(safeCallback('javascript:alert(1)')).toBeNull();
  });

  it('logged out, or any other page: no redirect', () => {
    expect(entryRedirect('/', null, false)).toBeNull();
    expect(entryRedirect('/auth/signin', '/caixa', false)).toBeNull();
    expect(entryRedirect('/pricing', null, true)).toBeNull();
    expect(entryRedirect('/auth/qualification', null, true)).toBeNull();
  });
});
