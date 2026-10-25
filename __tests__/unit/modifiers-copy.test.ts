/** The add-ons form said "Ajuste de Preco" (tutorial video capture 2026-10-25) */
import fs from 'fs';
import path from 'path';

it('writes "Ajuste de Preço" with the cedilla', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/admin/modifiers/page.tsx'), 'utf8');
  expect(page).not.toContain('Ajuste de Preco');
  expect(page).toContain('Ajuste de Preço');
});
