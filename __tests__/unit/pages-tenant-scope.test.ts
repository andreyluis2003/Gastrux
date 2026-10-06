import * as fs from 'fs';
import * as path from 'path';
import { getCacheHeader } from '../../lib/cache-headers';

/**
 * Server pages that read the database must filter by the current restaurant (2026-10-06): the
 * recipes page (/receitas) and the stock page (/estoque) listed EVERY restaurant's data to any
 * logged-in person. The API routes were swept on 2026-09-28; the pages were not. This test reads
 * every page and layout and fails when one queries the database without naming restaurantId.
 */
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'api' ? [] : files(p);
    return /^(page|layout)\.tsx$/.test(e.name) ? [p] : [];
  });
}

// Pages that read only the platform's own data, never a restaurant's (none today)
const PLATFORM_PAGES: string[] = [];

describe('server pages never list another restaurant\'s data', () => {
  const appDir = path.join(__dirname, '../../app');

  it('every page that queries the database filters by restaurantId', () => {
    const unscoped = files(appDir)
      .filter((f) => /prisma\.[a-zA-Z]+\.(findMany|count|findFirst|aggregate|groupBy)/.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !/restaurantId/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(appDir, f).replace(/\\/g, '/'))
      .filter((f) => !PLATFORM_PAGES.includes(f));
    expect(unscoped).toEqual([]);
  });

  it('the recipes and stock pages filter by the current restaurant', () => {
    for (const p of ['receitas/page.tsx', 'estoque/page.tsx']) {
      const src = fs.readFileSync(path.join(appDir, p), 'utf8');
      expect([p, /getCurrentRestaurantId\(\)/.test(src), /where: \{ restaurantId \}|restaurantId,\s*\n\s*active: true/.test(src)]).toEqual([p, true, true]);
    }
  });

  it('restaurant data is never marked as publicly cacheable', () => {
    for (const s of ['short', 'medium', 'long'] as const) {
      expect(getCacheHeader(s)['Cache-Control']).toMatch(/^private, no-store/);
    }
  });
});
