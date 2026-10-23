import { prisma } from '@/lib/prisma';
import { computeDre } from '@/lib/finance/dre';
import { profitabilityInRange } from '@/lib/finance/profitability';
import { analyzeMenu } from '@/lib/menu-engineering/analyze';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';

/**
 * Relatórios > Relatório executivo (2026-10-23). It was a PDF made by an external service (Abacus, key never
 * set in production: every PDF failed), with a "CMV" that summed every stock movement (purchases too) and
 * a popularity counted from production plans. Now a page ready to print or save as PDF in the browser,
 * with the numbers of the DRE, Lucratividade and Engenharia de cardápio.
 */
export type ExecutiveReportType = 'cmv' | 'menu-engineering' | 'waste' | 'comprehensive';
export const EXECUTIVE_REPORT_TYPES: ExecutiveReportType[] = ['cmv', 'menu-engineering', 'waste', 'comprehensive'];

const DAY_MS = 864e5;

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const br = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

const CLASS_LABEL: Record<string, string> = { STAR: 'Estrela', HORSE: 'Cavalo de Batalha', PUZZLE: 'Enigma', DOG: 'Abacaxi' };
const WASTE_REASON: Record<string, string> = {
  EXPIRED: 'Vencimento', PREPARATION: 'Preparo', DAMAGED: 'Danificado', OVERPRODUCTION: 'Sobreprodução', STORAGE: 'Armazenamento', OTHER: 'Outro',
};

/** The last `days` Brasília days, today included */
export function reportPeriod(days: number, now = new Date()) {
  const last = brtDay(now);
  const first = brtDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  const nextDay = brtDay(new Date(brtDayStart(last).getTime() + DAY_MS + 3_600_000));
  return { first, last, from: brtDayStart(first), to: brtDayStart(nextDay) };
}

const kpis = (items: Array<[string, string]>) =>
  `<div class="kpis">${items.map(([label, value]) => `<div class="kpi"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`).join('')}</div>`;

const table = (head: string[], rows: string[][], empty: string) =>
  rows.length === 0
    ? `<p class="empty">${esc(empty)}</p>`
    : `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;

async function cmvSection(restaurantId: string, p: ReturnType<typeof reportPeriod>) {
  const [{ dre }, prof] = await Promise.all([
    computeDre(restaurantId, p.first, p.last),
    profitabilityInRange(restaurantId, p.from, p.to),
  ]);
  const cmvPct = dre.receitaLiquida > 0 ? (dre.cmv / dre.receitaLiquida) * 100 : 0;
  const byCost = prof.dishes.filter((d) => !d.noCost).sort((a, b) => b.totalCost - a.totalCost).slice(0, 15);
  const html = `<section><h2>CMV (custo da mercadoria vendida)</h2>
    <p class="note">O mesmo CMV da DRE: o que foi vendido vezes o custo da ficha técnica de cada item.</p>
    ${kpis([['Receita líquida', brl(dre.receitaLiquida)], ['CMV', brl(dre.cmv)], ['CMV sobre a receita', pct(cmvPct)], ['Margem bruta', pct(dre.margemBruta)]])}
    <h3>Itens que mais pesam no custo</h3>
    ${table(['Item', 'Vendidos', 'Receita', 'Custo', 'Margem'], byCost.map((d) => [esc(d.name), String(d.quantitySold), brl(d.totalRevenue), brl(d.totalCost), pct(d.marginPercentage)]), 'Nenhuma venda com ficha técnica no período.')}
    ${prof.withoutCost > 0 ? `<p class="note">${prof.withoutCost} ${prof.withoutCost === 1 ? 'item vendido não tem' : 'itens vendidos não têm'} custo na ficha técnica e ${prof.withoutCost === 1 ? 'fica' : 'ficam'} fora do CMV.</p>` : ''}
  </section>`;
  return { html, revenue: dre.receitaLiquida, cmvPct, contribution: prof.totalProfit };
}

async function menuSection(restaurantId: string, days: number, withRecommendations: boolean) {
  const a = await analyzeMenu(restaurantId, days);
  const sorted = [...a.recipes].sort((x, y) => y.qtySold - x.qtySold);
  const head = ['Item', 'Classe', 'Vendidos', 'Preço', 'Custo', 'Margem'];
  const rows = sorted.map((r) => [esc(r.name), esc(CLASS_LABEL[r.classification]), String(r.qtySold), brl(r.sellingPrice), brl(r.costPerPortion), pct(r.profitMargin)]);
  const html = `<section><h2>Engenharia de cardápio</h2>
    <p class="note">${a.dataSource === 'SALES' ? 'Popularidade pelas vendas do período.' : 'Sem vendas no período: a popularidade vem dos planos de produção.'} Estrela: vende muito e dá margem. Cavalo de Batalha: vende muito com margem baixa. Enigma: dá margem e vende pouco. Abacaxi: vende pouco com margem baixa.</p>
    ${kpis([['Estrela', String(a.summary.stars)], ['Cavalo de Batalha', String(a.summary.horses)], ['Enigma', String(a.summary.puzzles)], ['Abacaxi', String(a.summary.dogs)]])}
    ${table(head, rows, 'Nenhuma ficha técnica ativa.')}
    ${withRecommendations && sorted.length ? `<h3>O que fazer</h3>${table(['Item', 'Recomendação'], sorted.map((r) => [esc(r.name), esc(r.recommendation)]), '')}` : ''}
    ${a.withoutFicha.length ? `<p class="note">Sem ficha técnica (fora da análise): ${a.withoutFicha.map(esc).join(', ')}.</p>` : ''}
  </section>`;
  return { html, summary: a.summary };
}

async function wasteSection(restaurantId: string, p: ReturnType<typeof reportPeriod>) {
  const logs = await prisma.wasteLog.findMany({
    where: { restaurantId, date: { gte: p.from, lt: p.to } },
    select: { reason: true, estimatedCost: true, quantity: true, ingredient: { select: { name: true, standardUnit: true } } },
  });
  const total = logs.reduce((s, w) => s + (w.estimatedCost || 0), 0);
  const byReason = new Map<string, number>();
  const byIngredient = new Map<string, { cost: number; qty: number; unit: string }>();
  for (const w of logs) {
    byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + (w.estimatedCost || 0));
    const name = w.ingredient?.name ?? 'Insumo removido';
    const it = byIngredient.get(name) ?? { cost: 0, qty: 0, unit: w.ingredient?.standardUnit ?? '' };
    it.cost += w.estimatedCost || 0;
    it.qty += w.quantity || 0;
    byIngredient.set(name, it);
  }
  const reasons = [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  const top = [...byIngredient.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 10);
  const html = `<section><h2>Desperdício e perdas</h2>
    ${kpis([['Custo do desperdício', brl(total)], ['Registros', String(logs.length)]])}
    <h3>Por motivo</h3>
    ${table(['Motivo', 'Custo', '% do total'], reasons.map(([r, c]) => [esc(WASTE_REASON[r] ?? r), brl(c), pct(total > 0 ? (c / total) * 100 : 0)]), 'Nenhum desperdício registrado no período.')}
    <h3>Insumos mais desperdiçados</h3>
    ${table(['Insumo', 'Quantidade', 'Custo'], top.map(([n, v]) => [esc(n), `${v.qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${esc(v.unit)}`, brl(v.cost)]), 'Nenhum desperdício registrado no período.')}
  </section>`;
  return { html, total };
}

const TITLE: Record<ExecutiveReportType, string> = {
  cmv: 'Relatório de CMV',
  'menu-engineering': 'Engenharia de cardápio',
  waste: 'Desperdício e perdas',
  comprehensive: 'Relatório executivo',
};

export async function executiveReportHtml(restaurantId: string, type: ExecutiveReportType, days: number, withRecommendations: boolean, now = new Date()) {
  const p = reportPeriod(days, now);
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
  let body = '';
  if (type === 'cmv') body = (await cmvSection(restaurantId, p)).html;
  else if (type === 'menu-engineering') body = (await menuSection(restaurantId, days, withRecommendations)).html;
  else if (type === 'waste') body = (await wasteSection(restaurantId, p)).html;
  else {
    const [cmv, menu, waste] = await Promise.all([cmvSection(restaurantId, p), menuSection(restaurantId, days, withRecommendations), wasteSection(restaurantId, p)]);
    body = `<section class="summary"><h2>Resumo</h2>
      ${kpis([['Receita líquida', brl(cmv.revenue)], ['CMV sobre a receita', pct(cmv.cmvPct)], ['Margem de contribuição', brl(cmv.contribution)], ['Desperdício', brl(waste.total)]])}
      <p class="note">Cardápio: ${menu.summary.stars} Estrela, ${menu.summary.horses} Cavalo de Batalha, ${menu.summary.puzzles} Enigma e ${menu.summary.dogs} Abacaxi. O resultado do mês com aluguel, folha e contas está na DRE.</p>
    </section>${cmv.html}${menu.html}${waste.html}`;
  }
  const title = TITLE[type];
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - ${esc(restaurant?.name ?? '')}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1f2937; margin: 0; padding: 24px; max-width: 960px; margin: 0 auto; }
  .bar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
  .bar button { background: #335538; color: #fff; border: 0; border-radius: 6px; padding: 10px 16px; font-size: 14px; cursor: pointer; }
  h1 { margin: 0 0 4px; font-size: 24px; } h2 { margin: 28px 0 8px; font-size: 18px; } h3 { margin: 18px 0 6px; font-size: 15px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 8px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
  .kpi { flex: 1 1 160px; background: #f3f4f6; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi .v { font-size: 20px; font-weight: bold; color: #142D27; } .kpi .l { font-size: 12px; color: #6b7280; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; } th { background: #f9fafb; }
  .note, .empty { color: #6b7280; font-size: 12px; } .empty { font-style: italic; }
  section { page-break-inside: avoid; } footer { margin-top: 32px; font-size: 11px; color: #9ca3af; }
  @media print { .bar { display: none; } body { padding: 0; } }
</style></head>
<body>
  <div class="bar"><button type="button" onclick="window.print()">Imprimir ou salvar em PDF</button></div>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(restaurant?.name ?? '')} · ${br(p.first)} a ${br(p.last)} (${days} dias) · gerado em ${now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
  ${body}
  <footer>Gerado pelo Gastrux.</footer>
</body></html>`;
}
