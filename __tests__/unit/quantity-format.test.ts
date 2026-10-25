/** Quantities in Brazilian format (tutorial video capture 2026-10-25: the technical sheet showed "0.12 kg" and "16.08 kg") */
import fs from 'fs';
import path from 'path';
import { formatQuantity } from '../../lib/formatters';

it('formats with a comma and keeps grams of a kilo (3 decimals)', () => {
  expect(formatQuantity(0.12, 'kg')).toBe('0,12 kg');
  expect(formatQuantity(0.003, 'kg')).toBe('0,003 kg');
  expect(formatQuantity(16.08, 'kg')).toBe('16,08 kg');
  expect(formatQuantity(1250, 'un')).toBe('1.250 un');
  expect(formatQuantity('0.05', 'kg')).toBe('0,05 kg');
  expect(formatQuantity(null)).toBe('0');
});

it('the technical sheet prints its quantities through formatQuantity', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/receitas/[id]/page.tsx'), 'utf8');
  expect(page).not.toMatch(/\{ri\.quantity\} \{ri\.unit\}/);
  expect(page).not.toMatch(/\{stockQty\} \{ri\.ingredient\.standardUnit\}/);
});
