/**
 * The Breadcrumb component always starts with "Início" (components/ui/breadcrumb.tsx). A page that passed
 * "Início" again showed "Início > Início > ..." (found recording the tutorials, lote 2, 2026-10-25).
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

it('no page passes "Início" to the Breadcrumb: the component already starts with it', () => {
  const offenders = [...files(path.join(process.cwd(), 'app')), ...files(path.join(process.cwd(), 'components'))]
    .filter((f) => /<Breadcrumb\s+items=\{\[\s*\{\s*label:\s*'Início'/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(process.cwd(), f).split(path.sep).join('/'));
  expect(offenders).toEqual([]);
});
