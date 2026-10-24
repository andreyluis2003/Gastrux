/** The calculator offers the same business types as the site and the signup (backlog 2026-10-23: it had its own list) */
import fs from 'fs';
import path from 'path';
import { SEGMENTS } from '../../lib/marketing/segments';

it('the calculator builds its business types from SEGMENTS, padaria and cafeteria apart', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/calculadora/page.tsx'), 'utf8');
  expect(src).toMatch(/SEGMENTS/);
  expect(src).not.toMatch(/Cafeteria \/ Padaria/);
  const slugs = SEGMENTS.map((s) => s.slug);
  expect(slugs).toEqual(expect.arrayContaining(['padaria', 'cafeteria', 'lanchonete']));
});
