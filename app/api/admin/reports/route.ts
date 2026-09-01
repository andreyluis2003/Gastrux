// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reports
 * Relatório consolidado - vendas, financeiro, estoque, staff
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'summary'; // summary | sales | financial | inventory | staff | customers
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    switch (type) {
      case 'sales':
        return await getSalesReport(restaurantId, startDate, days);
      case 'financial':
        return await getFinancialReport(restaurantId, startDate, days);
      case 'inventory':
        return await getInventoryReport(restaurantId);
      case 'staff':
        return await getStaffReport(restaurantId, startDate);
      case 'customers':
        return await getCustomerReport(restaurantId, startDate);
      default:
        return await getSummaryReport(restaurantId, startDate, days);
    }
  } catch (error) {
    console.error('[Admin Reports] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

async function getSummaryReport(restaurantId: string, startDate: Date, days: number) {
  const [payments, orders, snapshots, customers, staff] = await Promise.all([
    prisma.payment.findMany({
      where: { restaurantId, status: { in: ['APPROVED'] }, createdAt: { gte: startDate } },
      select: { amount: true, method: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: startDate } },
      select: { status: true, total: true, createdAt: true },
    }),
    prisma.metricSnapshot.findMany({
      where: { restaurantId, snapshotDate: { gte: startDate } },
      orderBy: { snapshotDate: 'desc' },
    }),
    prisma.customer.count({ where: { restaurantId, createdAt: { gte: startDate } } }),
    prisma.staffMember.count({ where: { restaurantId, status: 'ACTIVE' } }),
  ]);

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED').length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return NextResponse.json({
    type: 'summary',
    period: { days, startDate: startDate.toISOString() },
    revenue: { total: totalRevenue, avgDaily: totalRevenue / Math.max(days, 1) },
    orders: { total: totalOrders, completed: completedOrders, avgTicket },
    customers: { new: customers },
    staff: { active: staff },
    snapshots: snapshots.slice(0, 7).map((s) => ({
      date: s.snapshotDate,
      revenue: Number(s.totalRevenue),
      cost: Number(s.totalCost),
      orders: s.totalOrders,
      margin: Number(s.profitMargin),
    })),
  });
}

async function getSalesReport(restaurantId: string, startDate: Date, days: number) {
  const payments = await prisma.payment.findMany({
    where: { restaurantId, status: { in: ['APPROVED', 'PROCESSING'] }, createdAt: { gte: startDate } },
    select: { amount: true, method: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Agrupar por dia
  const dailySales: Record<string, { revenue: number; count: number }> = {};
  payments.forEach((p) => {
    const day = p.createdAt.toISOString().split('T')[0];
    if (!dailySales[day]) dailySales[day] = { revenue: 0, count: 0 };
    dailySales[day].revenue += Number(p.amount);
    dailySales[day].count += 1;
  });

  // Agrupar por método
  const byMethod: Record<string, { total: number; count: number }> = {};
  payments.forEach((p) => {
    const method = p.method || 'OUTROS';
    if (!byMethod[method]) byMethod[method] = { total: 0, count: 0 };
    byMethod[method].total += Number(p.amount);
    byMethod[method].count += 1;
  });

  // Top receitas vendidas
  const topRecipes = await prisma.orderItem.groupBy({
    by: ['recipeId'],
    _sum: { quantity: true },
    _count: { id: true },
    where: {
      order: { restaurantId, createdAt: { gte: startDate }, status: { in: ['COMPLETED', 'READY'] } },
    },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  });

  const recipeIds = topRecipes.map((r) => r.recipeId);
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: recipeIds }, restaurantId },
    select: { id: true, name: true, sellingPrice: true },
  });

  return NextResponse.json({
    type: 'sales',
    period: { days, startDate: startDate.toISOString() },
    totalRevenue: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    totalTransactions: payments.length,
    dailySales: Object.entries(dailySales).map(([date, data]) => ({ date, ...data })),
    byMethod: Object.entries(byMethod).map(([method, data]) => ({ method, ...data })),
    topRecipes: topRecipes.map((r) => {
      const recipe = recipes.find((rec) => rec.id === r.recipeId);
      return {
        recipeId: r.recipeId,
        name: recipe?.name || 'Desconhecido',
        sellingPrice: recipe?.sellingPrice ? Number(recipe.sellingPrice) : 0,
        totalQuantity: r._sum.quantity || 0,
        totalOrders: r._count.id,
      };
    }),
  });
}

async function getFinancialReport(restaurantId: string, startDate: Date, days: number) {
  const [payments, cashFlow, forecasts] = await Promise.all([
    prisma.payment.findMany({
      where: { restaurantId, createdAt: { gte: startDate } },
      select: { amount: true, status: true, method: true, createdAt: true },
    }),
    prisma.cashFlowRecord.findMany({
      where: { restaurantId, date: { gte: startDate } },
      select: { type: true, category: true, amount: true, date: true },
      orderBy: { date: 'asc' },
    }),
    prisma.financialForecast.findMany({
      where: { restaurantId },
      orderBy: { startDate: 'desc' },
      take: 7,
    }),
  ]);

  const approvedPayments = payments.filter((p) => p.status === 'APPROVED');
  const totalRevenue = approvedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const rejectedPayments = payments.filter((p) => p.status === 'REJECTED');

  // Fluxo de caixa
  const inflows = cashFlow.filter((r) => r.type === 'INCOME').reduce((sum, r) => sum + Number(r.amount), 0);
  const outflows = cashFlow.filter((r) => r.type === 'EXPENSE').reduce((sum, r) => sum + Number(r.amount), 0);

  // Agrupar saídas por categoria
  const expensesByCategory: Record<string, number> = {};
  cashFlow.filter((r) => r.type === 'EXPENSE').forEach((r) => {
    const cat = r.category || 'Outros';
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(r.amount);
  });

  return NextResponse.json({
    type: 'financial',
    period: { days, startDate: startDate.toISOString() },
    revenue: { total: totalRevenue, avgDaily: totalRevenue / Math.max(days, 1) },
    cashFlow: { inflows, outflows, netFlow: inflows - outflows },
    expensesByCategory: Object.entries(expensesByCategory).map(([category, amount]) => ({ category, amount })),
    rejectedPayments: { count: rejectedPayments.length, total: rejectedPayments.reduce((sum, p) => sum + Number(p.amount), 0) },
    forecasts: forecasts.map((f) => ({
      date: f.startDate,
      predictedRevenue: Number(f.forecastedValue),
      confidence: f.confidence ? Number(f.confidence) : null,
      methodology: f.method,
    })),
  });
}

async function getInventoryReport(restaurantId: string) {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, active: true },
    select: {
      id: true,
      name: true,
      standardUnit: true,
      currentStock: { select: { currentQuantity: true } },
      minimumStock: true,
      referenceCost: true,
      category: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const qtyOf = (i: (typeof ingredients)[number]) => Number(i.currentStock?.currentQuantity ?? 0);

  const lowStock = ingredients.filter(
    (i) => i.currentStock !== null && i.minimumStock !== null && qtyOf(i) < Number(i.minimumStock)
  );

  const totalValue = ingredients.reduce((sum, i) => {
    return sum + (qtyOf(i) * Number(i.referenceCost || 0));
  }, 0);

  // Categorias
  const byCategory: Record<string, { count: number; value: number }> = {};
  ingredients.forEach((i) => {
    const cat = i.category?.name || 'Sem Categoria';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
    byCategory[cat].count += 1;
    byCategory[cat].value += qtyOf(i) * Number(i.referenceCost || 0);
  });

  return NextResponse.json({
    type: 'inventory',
    totalIngredients: ingredients.length,
    totalValue,
    lowStock: {
      count: lowStock.length,
      items: lowStock.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.standardUnit,
        currentStock: qtyOf(i),
        minimumStock: Number(i.minimumStock),
        deficit: Number(i.minimumStock) - qtyOf(i),
      })),
    },
    byCategory: Object.entries(byCategory).map(([category, data]) => ({ category, ...data })),
  });
}

async function getStaffReport(restaurantId: string, startDate: Date) {
  const staff = await prisma.staffMember.findMany({
    where: { restaurantId },
    include: {
      user: { select: { name: true, email: true } },
      shifts: {
        where: { shiftDate: { gte: startDate } },
      },
      commissions: {
        where: { period: { gte: startDate } },
        orderBy: { period: 'desc' },
      },
    },
  });

  return NextResponse.json({
    type: 'staff',
    totalStaff: staff.length,
    activeStaff: staff.filter((s) => s.status === 'ACTIVE').length,
    members: staff.map((s) => ({
      id: s.id,
      name: s.user?.name || s.user?.email || 'N/A',
      role: s.role,
      status: s.status,
      baseSalary: Number(s.basesalary || 0),
      ordersProcessed: s.totalOrdersProcessed,
      avgPrepTime: s.averagePreparationTime,
      satisfaction: s.customerSatisfactionScore,
      shiftsCount: s.shifts.length,
      shiftsWorked: s.shifts.filter((sh) => sh.isWorked).length,
      totalCommissions: s.commissions.reduce((sum, c) => sum + Number(c.totalEarned), 0),
    })),
    totalSalaries: staff.filter((s) => s.status === 'ACTIVE').reduce((sum, s) => sum + Number(s.basesalary || 0), 0),
    totalCommissions: staff.reduce((sum, s) => sum + s.commissions.reduce((cs, c) => cs + Number(c.totalEarned), 0), 0),
  });
}

async function getCustomerReport(restaurantId: string, startDate: Date) {
  const [totalCustomers, newCustomers, segments, topCustomers] = await Promise.all([
    prisma.customer.count({ where: { restaurantId } }),
    prisma.customer.count({ where: { restaurantId, createdAt: { gte: startDate } } }),
    prisma.customerSegment.groupBy({
      by: ['segment'],
      where: { customer: { restaurantId } },
      _count: { id: true },
      _sum: { totalSpent: true, totalOrders: true },
      _avg: { averageTicket: true },
    }),
    prisma.customerSegment.findMany({
      where: { customer: { restaurantId } },
      orderBy: { totalSpent: 'desc' },
      take: 10,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    }),
  ]);

  return NextResponse.json({
    type: 'customers',
    totalCustomers,
    newCustomers,
    segments: segments.map((s) => ({
      segment: s.segment,
      count: s._count.id,
      totalSpent: Number(s._sum.totalSpent || 0),
      totalOrders: s._sum.totalOrders || 0,
      avgTicket: Number(s._avg.averageTicket || 0),
    })),
    topCustomers: topCustomers.map((tc) => ({
      id: tc.customer.id,
      name: tc.customer.name,
      email: tc.customer.email,
      phone: tc.customer.phone,
      segment: tc.segment,
      totalSpent: Number(tc.totalSpent),
      totalOrders: tc.totalOrders,
      avgTicket: Number(tc.averageTicket),
      lastOrder: tc.lastOrderAt,
    })),
  });
}
