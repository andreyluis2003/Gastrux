/**
 * Money on screen is Brazilian (R$ 14,00): "R$ {x.toFixed(2)}" always prints a dot (R$ 14.00), found on the QR
 * menu in the video screenshots of 2026-10-24. Pages use formatBRL (lib/formatters.ts).
 */
import fs from 'fs';
import path from 'path';

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });
}

it('no screen prints a price with toFixed after "R$"', () => {
  const offenders = [...files(path.join(process.cwd(), 'app')), ...files(path.join(process.cwd(), 'components'))]
    .filter((f) => /R\$ \{[^}]*toFixed\(2\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(process.cwd(), f).split(path.sep).join('/'));
  expect(offenders).toEqual([]);
});
