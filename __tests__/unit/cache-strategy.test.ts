/**
 * Every API answer depends on the signed-in user and restaurant: none may be cached publicly (a CDN
 * could serve one restaurant's data to another) nor kept by the browser (the kitchen screen stayed
 * up to 5 minutes behind: found in the browser test of 2026-09-24).
 */
import { getCacheHeaders, getCacheTypeForRoute } from '../../lib/cache-strategy';

describe('API cache headers (middleware)', () => {
  const routes = [
    '/api/kds/orders',
    '/api/comanda/sessions/abc',
    '/api/recipes',
    '/api/ingredients',
    '/api/stock',
    '/api/analytics/metrics',
    '/api/caixa',
    '/api/print/receipt/abc',
    '/api/anything-new',
  ];

  it.each(routes)('%s is private and never stored', (route) => {
    const headers = getCacheHeaders(getCacheTypeForRoute(route));
    expect(headers['Cache-Control']).toBe('private, no-store, max-age=0');
    expect(headers['Cache-Control']).not.toMatch(/public|s-maxage|immutable/);
  });
});
