// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { monthDate } from '@/lib/utility-bills/rules';
import { salesInRange } from '@/lib/finance/month-sales';
import { soldByRecipe } from '@/lib/daily-count/sold';
import { brtDayStart } from '@/lib/staff/commission-rules';

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
  const receitaBruta = sales.totalCents / 100;
  const receitaDineIn = sales.salaoCents / 100;
  const receitaDelivery = sales.deliveryCents / 100;
  const taxaServico = sales.serviceCents / 100;

  // 2. DEDUÇÕES - taxes and discounts of the delivery orders (comanda discounts are already net)
  const impostos = sales.deliveryTaxesCents / 100;
  const descontos = sales.deliveryDiscountCents / 100;
  const deducoes = impostos + descontos;
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
    const costs = await prisma.recipe.findMany({ where: { restaurantId, id: { in: Object.keys(sold) } }, select: { id: true, costPerPortion: true } });
    cmv = costs.reduce((sum, r) => sum + (r.costPerPortion || 0) * (sold[r.id] ?? 0), 0);
  }

  const lucroBruto = receitaLiquida - cmv;
  const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;

  // 4. DESPESAS OPERACIONAIS - expenses paid from the drawer (Caixa "Despesa"); a withdrawal is money
  // moved to the safe, not an expense. Plus the legacy register payments (before 2026-10-05).
  const [drawerExpenses, cashMovements] = await Promise.all([
    prisma.cashSessionEntry.aggregate({
      where: { restaurantId, type: 'EXPENSE', createdAt: { gte: start, lt: endExclusive } },
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
  const despesasPessoal = staff.reduce((sum, s) => sum + Number(s.basesalary || 0), 0) * monthsInRange;

  // 5b. CONTAS DE CONSUMO - by reference month, whole months (spec 2026-10-16 contas de consumo, 4.6)
  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);
  const utility = await prisma.utilityBill.aggregate({
    where: { restaurantId, referenceMonth: { gte: monthDate(startMonth), lte: monthDate(endMonth) } },
    _sum: { amountCents: true },
  });
  const contasConsumo = (utility._sum.amountCents ?? 0) / 100;
  const lastDay = new Date(Date.UTC(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)), 0)).getUTCDate();
  const contasConsumoMesInteiro = contasConsumo > 0 && (!startDate.endsWith('-01') || Number(endDate.slice(8, 10)) !== lastDay);

  // 6. RESULTADO
  const despesasTotais = despesasOperacionais + despesasPessoal + contasConsumo;
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
      taxaServico,
      receitaCaixa,
      deducoes: {
        impostos,
        descontos,
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
        taxasGateway,
        total: despesasTotais + taxasGateway,
      },
      contasConsumoMesInteiro,
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
