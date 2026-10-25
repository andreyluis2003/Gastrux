/** Percentages in Brazilian format (18,4%), like the money (video screenshots 2026-10-24: 18.4% on CMV, 69.6% on DRE) */
import fs from 'fs';
import path from 'path';
import { formatPercent } from '../../lib/formatters';

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

it('formats with a comma and the given decimals', () => {
  expect(formatPercent(18.4)).toBe('18,4%');
  expect(formatPercent(69.6, 1)).toBe('69,6%');
  expect(formatPercent(2.345, 2)).toBe('2,35%');
  expect(formatPercent(30)).toBe('30,0%');
  expect(formatPercent(1234.5)).toBe('1.234,5%');
  expect(formatPercent(null)).toBe('0,0%');
  expect(formatPercent(Number.NaN)).toBe('0,0%');
});

it('no screen or alert prints a percentage with decimals through toFixed', () => {
  const offenders = [...files(path.join(process.cwd(), 'app')), ...files(path.join(process.cwd(), 'components'))]
    .filter((f) => /toFixed\([12]\)\}?%/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(process.cwd(), f).split(path.sep).join('/'));
  expect(offenders).toEqual([]);
});
