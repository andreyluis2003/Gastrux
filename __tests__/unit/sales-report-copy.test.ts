/** Relatórios > Vendas showed "Analise de vendas por periodo", "Ticket Medio" and "Periodo" (tutorial video capture 2026-10-25) */
import fs from 'fs';
import path from 'path';

it('writes the sales report labels with their accents', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/reports/sales/page.tsx'), 'utf8');
  for (const wrong of ['Analise de vendas por periodo', '>Ticket Medio<', '>Periodo<']) expect([wrong, page.includes(wrong)]).toEqual([wrong, false]);
  for (const right of ['Análise de vendas por período e categoria', 'Ticket médio', 'Período']) expect([right, page.includes(right)]).toEqual([right, true]);
});
