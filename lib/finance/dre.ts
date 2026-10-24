// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { addMonths, monthDate, monthOf } from '@/lib/utility-bills/rules';
import { salesInRange } from '@/lib/finance/month-sales';
import { soldByRecipe } from '@/lib/daily-count/sold';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { dreLine, type PayableCategory } from '@/lib/payables/rules';
import { recipeCostMap } from '@/lib/recipes/cost-map';

/**
 * The DRE of a period of Brasília days (startDate and endDate as AAAA-MM-DD, end included): the screen
 * (app/api/financeiro/dre) and the AI assistant (dre_resumo) use the same numbers.
 */
export async function computeDre(restaurantId: string, startDate: string, endDate: string) {
  // The period follows Brasília days: [start 00:00, day after end 00:00)
  const start = brtDayStart(startDate);
  const endExclusive = brtDayStart(new Date(Date.parse(`${endDate}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10));
  const end = new Date(endExclusive.getTime() - 1);

  // 1. RECEITA BRUTA - the Caixa criterion (owner 2026-10-16): paid comandas and counter sales,
  // pay at the table after refunds, and delivery orders without a comanda; the service charge is inside
  const sales = await salesInRange(restaurantId, start, endExclusive);
  // Cashback used on the bills closed in the period (spec 2026-10-23 §8): the drawer got the total with the
  // discount, so the gross revenue adds it back and the deductions take it out again
  const cashbackUsed = await prisma.orderSession.aggregate({
    where: { restaurantId, status: 'CLOSED', closedAt: { gte: start, lt: endExclusive }, cashbackUsedCents: { gt: 0 } },
    _sum: { cashbackUsedCents: true },
  });
  const cashback = (cashbackUsed._sum.cashbackUsedCents ?? 0) / 100;
  const receitaBruta = sales.totalCents / 100 + cashback;
  const receitaDineIn = sales.salaoCents / 100 + cashback;
  const receitaDelivery = sales.deliveryCents / 100;
  // By origin (plan 2026-10-23 api-de-pedidos): what came through the Gastrux order API, and the site and the rest
  const receitaDeliveryPorOrigem = {
    site: sales.deliveryByOrigin.site / 100,
    gastrux_api: sales.deliveryByOrigin.gastrux_api / 100,
    ifood: sales.deliveryByOrigin.ifood / 100,
  };
  const taxaServico = sales.serviceCents / 100;

  // 2. DEDUÇÕES - taxes and discounts of the delivery orders (comanda discounts are already net)
  const impostos = sales.deliveryTaxesCents / 100;
  const descontos = sales.deliveryDiscountCents / 100;
  const deducoes = impostos + descontos + cashback;
  const receitaLiquida = receitaBruta - deducoes;

  // 3. CMV (Custo de Mercadoria Vendida) - from CMV snapshots or estimate
  const cmvSnapshots = await prisma.cMVSnapshot.findMany({
    where: {
      restaurantId,
      periodStart: { gte: start },
      periodEnd: { lte: end },
    },
  });
  const cmvTotal = cmvSnapshots.reduce((sum, s) => sum + Number((s as any).totalCost || 0), 0);

  // If no CMV snapshots, estimate from what was sold (comanda lines + delivery) at the recipe cost
  let cmv = cmvTotal;
  if (cmv === 0) {
    const sold = await soldByRecipe(prisma, restaurantId, null, start, endExclusive);
    // The cost of each ficha now, from its insumos (the stored costPerPortion was never written: CMV read zero)
    const costs = await recipeCostMap(restaurantId, Object.keys(sold));
    cmv = Object.entries(sold).reduce((sum, [id, qty]) => sum + (costs.get(id) ?? 0) * qty, 0);
  }

  const lucroBruto = receitaLiquida - cmv;
  const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;

  // 4. DESPESAS OPERACIONAIS - expenses paid from the drawer (Caixa "Despesa"); a withdrawal is money
  // moved to the safe, not an expense. Plus the legacy register payments (before 2026-10-05).
  const [drawerExpenses, cashMovements] = await Promise.all([
    prisma.cashSessionEntry.aggregate({
      // A drawer expense that paid a bill is counted by the bill, in its month (spec 2026-10-18 contas a pagar)
      where: { restaurantId, type: 'EXPENSE', payableId: null, createdAt: { gte: start, lt: endExclusive } },
      _sum: { amountCents: true },
    }),
    prisma.cashMovement.findMany({
      where: { cashRegister: { restaurantId }, createdAt: { gte: start, lt: endExclusive }, type: { in: ['PAYMENT', 'OTHER'] } },
      select: { amount: true },
    }),
  ]);
  const despesasOperacionais = (drawerExpenses._sum.amountCents ?? 0) / 100 + cashMovements.reduce((sum, m) => sum + Math.abs(Number(m.amount)), 0);

  // 5. DESPESAS COM PESSOAL - from StaffMembers
  const staff = await prisma.staffMember.findMany({
    where: { restaurantId, status: 'ACTIVE' },
    select: { basesalary: true },
  });
  const monthsInRange = Math.max(1, (end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));
  const staffSalaries = staff.reduce((sum, s) => sum + Number(s.basesalary || 0), 0);
  const estimativaPessoal = staffSalaries * monthsInRange;

  // 5b. CONTAS DE CONSUMO - by reference month, whole months (spec 2026-10-16 contas de consumo, 4.6)
  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);
  const utility = await prisma.utilityBill.aggregate({
    where: { restaurantId, referenceMonth: { gte: monthDate(startMonth), lte: monthDate(endMonth) } },
    _sum: { amountCents: true },
  });
  const contasConsumo = (utility._sum.amountCents ?? 0) / 100;

  // 5c. CONTAS A PAGAR by competence (spec 2026-10-18): merchandise is in the CMV and utilities in their own line,
  // so only the other categories count here; payroll bills replace the estimate from the staff salaries
  const payables = await prisma.payable.groupBy({
    by: ['category', 'competenceMonth'],
    where: { restaurantId, status: { not: 'CANCELED' }, competenceMonth: { gte: monthDate(startMonth), lte: monthDate(endMonth) } },
    _sum: { amountCents: true },
  });
  let contasAPagarCents = 0;
  let payrollCents = 0;
  const payrollMonths = new Set<string>();
  for (const g of payables) {
    const line = dreLine(g.category as PayableCategory);
    if (line === 'OPERATIONAL') contasAPagarCents += g._sum.amountCents ?? 0;
    if (line === 'PAYROLL' && (g._sum.amountCents ?? 0) > 0) {
      payrollCents += g._sum.amountCents ?? 0;
      payrollMonths.add(monthOf(g.competenceMonth));
    }
  }
  const contasAPagar = contasAPagarCents / 100;
  // Month by month: a month with payroll bills uses them, the others keep the estimate for their days in the period
  const DAY = 24 * 60 * 60 * 1000;
  let estimatedMonths = 0;
  let allMonths = 0;
  for (let ym = startMonth; ym <= endMonth; ym = addMonths(ym, 1)) {
    allMonths++;
    if (payrollMonths.has(ym)) continue;
    estimatedMonths++;
    const from = Math.max(start.getTime(), brtDayStart(ym + '-01').getTime());
    const to = Math.min(endExclusive.getTime(), brtDayStart(addMonths(ym, 1) + '-01').getTime());
    payrollCents += Math.round((staffSalaries * Math.max(0, to - from)) / (30 * DAY) * 100);
  }
  const pessoalOrigem: 'contas' | 'estimativa' | 'misto' = estimatedMonths === allMonths ? 'estimativa' : estimatedMonths === 0 ? 'contas' : 'misto';
  const despesasPessoal = pessoalOrigem === 'estimativa' ? estimativaPessoal : payrollCents / 100;
  const lastDay = new Date(Date.UTC(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)), 0)).getUTCDate();
  const partialMonth = !startDate.endsWith('-01') || Number(endDate.slice(8, 10)) !== lastDay;
  const contasConsumoNotaMesInteiro = contasConsumo > 0 && partialMonth;
  // Bills (and payroll bills) also count by their whole month
  const contasMesInteiro = (contasAPagar > 0 || payrollMonths.size > 0) && partialMonth;

  // 6. RESULTADO
  const despesasTotais = despesasOperacionais + despesasPessoal + contasConsumo + contasAPagar;
  const resultadoOperacional = lucroBruto - despesasTotais;
  const margemOperacional = receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : 0;

  // Payment method breakdown for revenue
  const payments = await prisma.payment.findMany({
    where: {
      restaurantId,
      createdAt: { gte: start, lte: end },
      status: 'APPROVED',
    },
    select: { method: true, amount: true, gatewayFee: true },
  });

  const taxasGateway = payments.reduce((sum, p) => sum + Number(p.gatewayFee || 0), 0);
  const receitaPorMetodo: Record<string, number> = Object.fromEntries(Object.entries(sales.byMethod).map(([m, c]) => [m, c / 100]));

  const receitaCaixa = 0; // legacy register, replaced by the Caixa criterion above

  const resultadoLiquido = resultadoOperacional - taxasGateway;
  const margemLiquida = receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

  return {
    periodo: { inicio: start.toISOString(), fim: end.toISOString() },
    dre: {
      receitaBruta,
      receitaDineIn,
      receitaDelivery,
      receitaDeliveryPorOrigem,
      taxaServico,
      receitaCaixa,
      deducoes: {
        impostos,
        descontos,
        cashback,
        total: deducoes,
      },
      receitaLiquida,
      cmv,
      lucroBruto,
      margemBruta: Math.round(margemBruta * 100) / 100,
      despesasOperacionais: {
        operacional: despesasOperacionais,
        pessoal: despesasPessoal,
        contasConsumo,
        contasAPagar,
        taxasGateway,
        total: despesasTotais + taxasGateway,
      },
      contasConsumoNotaMesInteiro,
      contasMesInteiro,
      pessoalOrigem,
      resultadoOperacional,
      margemOperacional: Math.round(margemOperacional * 100) / 100,
      resultadoLiquido,
      margemLiquida: Math.round(margemLiquida * 100) / 100,
    },
    detalhamento: {
      totalPedidos: sales.salesCount,
      receitaPorMetodo,
      totalFuncionarios: staff.length,
    },
  };
}
