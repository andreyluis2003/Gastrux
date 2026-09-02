// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate e endDate são obrigatórios' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    // 1. RECEITA BRUTA - Revenue from completed orders
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: start, lte: end },
        status: { in: ['COMPLETED', 'READY'] },
      },
      select: { subtotal: true, total: true, taxes: true, fees: true, discount: true, orderType: true },
    });

    const receitaBruta = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const receitaDineIn = orders.filter(o => o.orderType === 'DINE_IN').reduce((sum, o) => sum + Number(o.total || 0), 0);
    const receitaDelivery = orders.filter(o => o.orderType === 'DELIVERY').reduce((sum, o) => sum + Number(o.total || 0), 0);

    // 2. DEDUÇÕES - Taxes, discounts, fees
    const impostos = orders.reduce((sum, o) => sum + Number(o.taxes || 0), 0);
    const descontos = orders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
    const taxasPlataforma = orders.reduce((sum, o) => sum + Number(o.fees || 0), 0);
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

    // If no CMV snapshots, estimate from recipe costs
    let cmv = cmvTotal;
    if (cmv === 0) {
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            restaurantId,
            createdAt: { gte: start, lte: end },
            status: { in: ['COMPLETED', 'READY'] },
          },
        },
        include: { recipe: { select: { costPerPortion: true } } },
      });
      cmv = orderItems.reduce((sum, item) => sum + (item.recipe?.costPerPortion || 0) * item.quantity, 0);
    }

    const lucroBruto = receitaLiquida - cmv;
    const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;

    // 4. DESPESAS OPERACIONAIS - from CashMovements
    const cashMovements = await prisma.cashMovement.findMany({
      where: {
        cashRegister: { restaurantId },
        createdAt: { gte: start, lte: end },
        type: { in: ['PAYMENT', 'WITHDRAWAL', 'OTHER'] },
      },
      select: { amount: true, description: true, type: true },
    });

    const despesasOperacionais = cashMovements.reduce((sum, m) => sum + Math.abs(Number(m.amount)), 0);

    // 5. DESPESAS COM PESSOAL - from StaffMembers
    const staff = await prisma.staffMember.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { basesalary: true },
    });
    const monthsInRange = Math.max(1, (end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const despesasPessoal = staff.reduce((sum, s) => sum + Number(s.basesalary || 0), 0) * monthsInRange;

    // 6. RESULTADO
    const despesasTotais = despesasOperacionais + despesasPessoal;
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

    const receitaPorMetodo: Record<string, number> = {};
    const taxasGateway = payments.reduce((sum, p) => sum + Number(p.gatewayFee || 0), 0);
    payments.forEach((p) => {
      receitaPorMetodo[p.method] = (receitaPorMetodo[p.method] || 0) + Number(p.amount);
    });

    // Income from CashMovements (SALE type)
    const salesMovements = await prisma.cashMovement.findMany({
      where: {
        cashRegister: { restaurantId },
        createdAt: { gte: start, lte: end },
        type: 'SALE',
      },
    });
    const receitaCaixa = salesMovements.reduce((sum, m) => sum + Number(m.amount), 0);

    const resultadoLiquido = resultadoOperacional - taxasGateway;
    const margemLiquida = receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

    return NextResponse.json({
      periodo: { inicio: start.toISOString(), fim: end.toISOString() },
      dre: {
        receitaBruta,
        receitaDineIn,
        receitaDelivery,
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
          taxasGateway,
          total: despesasTotais + taxasGateway,
        },
        resultadoOperacional,
        margemOperacional: Math.round(margemOperacional * 100) / 100,
        resultadoLiquido,
        margemLiquida: Math.round(margemLiquida * 100) / 100,
      },
      detalhamento: {
        totalPedidos: orders.length,
        receitaPorMetodo,
        totalFuncionarios: staff.length,
      },
    });
  } catch (error) {
    console.error('Error generating DRE:', error);
    return NextResponse.json({ error: 'Erro ao gerar DRE' }, { status: 500 });
  }
}
