// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

// Typical marketplace fees
const PLATFORM_FEES: Record<string, number> = {
  ifood: 0.23,      // ~23% commission
  uber_eats: 0.25,  // ~25% commission
  rappi: 0.22,      // ~22% commission
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const url = req.nextUrl;
    const period = url.searchParams.get('period') || '30'; // days
    const periodDays = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // 1. External Orders (marketplace)
    const externalOrders = await prisma.externalOrder.findMany({
      where: {
        restaurantId,
        orderReceivedAt: { gte: startDate },
        status: { in: ['DELIVERED', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP'] },
      },
      select: {
        totalAmount: true,
        platformFee: true,
        deliveryFee: true,
        orderReceivedAt: true,
        integration: { select: { platform: true } },
      },
    });

    // 2. Direct Orders (own channel)
    const directOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: startDate },
        orderType: 'DELIVERY',
        status: { notIn: ['CANCELLED'] },
      },
      select: {
        total: true,
        fees: true,
        createdAt: true,
      },
    });

    // 3. QR Scans
    const qrScans = await prisma.packagingQRScan.findMany({
      where: {
        restaurantId,
        scannedAt: { gte: startDate },
      },
      select: {
        converted: true,
        scannedAt: true,
      },
    });

    // Calculate metrics
    const marketplaceRevenue = externalOrders.reduce((s, o) => s + o.totalAmount, 0);
    const marketplaceFeesPaid = externalOrders.reduce((s, o) => {
      const platform = o.integration?.platform || 'ifood';
      const feeRate = PLATFORM_FEES[platform] || 0.23;
      // Use actual platformFee if available, otherwise estimate
      return s + (o.platformFee > 0 ? o.platformFee : o.totalAmount * feeRate);
    }, 0);
    const marketplaceNetRevenue = marketplaceRevenue - marketplaceFeesPaid;

    const directRevenue = directOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const directFees = directOrders.reduce((s, o) => s + (Number(o.fees) || 0), 0);
    const directNetRevenue = directRevenue - directFees;

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const allExternalOrders = await prisma.externalOrder.findMany({
      where: {
        restaurantId,
        orderReceivedAt: { gte: sixMonthsAgo },
        status: { in: ['DELIVERED', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP'] },
      },
      select: { totalAmount: true, platformFee: true, orderReceivedAt: true, integration: { select: { platform: true } } },
    });

    const allDirectOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: sixMonthsAgo },
        orderType: 'DELIVERY',
        status: { notIn: ['CANCELLED'] },
      },
      select: { total: true, createdAt: true },
    });

    // Group by month
    const monthlyData: Record<string, { marketplace: number; direct: number; feesSaved: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { marketplace: 0, direct: 0, feesSaved: 0 };
    }

    for (const o of allExternalOrders) {
      const d = new Date(o.orderReceivedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        monthlyData[key].marketplace += o.totalAmount;
      }
    }

    for (const o of allDirectOrders) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        const val = Number(o.total) || 0;
        monthlyData[key].direct += val;
        // Fees saved = what we would have paid to marketplace
        monthlyData[key].feesSaved += val * 0.23;
      }
    }

    const monthlyTrend = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      ...data,
    }));

    // Platform breakdown
    const platformBreakdown: Record<string, { orders: number; revenue: number; fees: number }> = {};
    for (const o of externalOrders) {
      const platform = o.integration?.platform || 'ifood';
      if (!platformBreakdown[platform]) platformBreakdown[platform] = { orders: 0, revenue: 0, fees: 0 };
      platformBreakdown[platform].orders += 1;
      platformBreakdown[platform].revenue += o.totalAmount;
      const feeRate = PLATFORM_FEES[platform] || 0.23;
      platformBreakdown[platform].fees += (o.platformFee > 0 ? o.platformFee : o.totalAmount * feeRate);
    }

    // QR stats
    const totalQrScans = qrScans.length;
    const qrConversions = qrScans.filter(s => s.converted).length;

    // ROI calculation
    const feeSavingsFromDirect = directRevenue * 0.23; // What we would have paid on marketplace
    const migrationROI = marketplaceFeesPaid > 0
      ? ((feeSavingsFromDirect / marketplaceFeesPaid) * 100).toFixed(1)
      : '0.0';

    return NextResponse.json({
      period: periodDays,
      marketplace: {
        orders: externalOrders.length,
        revenue: marketplaceRevenue.toFixed(2),
        feesPaid: marketplaceFeesPaid.toFixed(2),
        netRevenue: marketplaceNetRevenue.toFixed(2),
        avgFeeRate: marketplaceRevenue > 0 ? ((marketplaceFeesPaid / marketplaceRevenue) * 100).toFixed(1) : '0.0',
      },
      direct: {
        orders: directOrders.length,
        revenue: directRevenue.toFixed(2),
        fees: directFees.toFixed(2),
        netRevenue: directNetRevenue.toFixed(2),
        feeSavings: feeSavingsFromDirect.toFixed(2),
      },
      qr: {
        totalScans: totalQrScans,
        conversions: qrConversions,
        conversionRate: totalQrScans > 0 ? ((qrConversions / totalQrScans) * 100).toFixed(1) : '0.0',
      },
      migrationROI,
      platformBreakdown: Object.entries(platformBreakdown).map(([platform, d]) => ({
        platform,
        label: platform === 'ifood' ? 'iFood' : platform === 'uber_eats' ? 'Uber Eats' : 'Rappi',
        ...d,
        feeRate: d.revenue > 0 ? ((d.fees / d.revenue) * 100).toFixed(1) : '0.0',
      })),
      monthlyTrend,
    });
  } catch (error) {
    console.error('Migração ROI GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
