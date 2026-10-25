/**
 * The comanda screen on a phone (video screenshots 2026-10-24): the menu column is a grid item, and a grid item does
 * not shrink below its content; the category tabs row is wider than a phone, so the search box and the second column
 * of products went past the right edge. min-w-0 lets the column fit and the tabs row scroll.
 */
import fs from 'fs';
import path from 'path';

it('the menu column of the comanda can shrink to the phone width', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/vender/[sessionId]/page.tsx'), 'utf8');
  expect(src).toMatch(/className="lg:col-span-2 min-w-0"/);
});
