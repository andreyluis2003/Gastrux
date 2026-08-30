// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  calculateMRR,
  calculateConversionRate,
  calculateChurnRate,
  calculateARPU,
  calculatePaymentSuccessRate,
  calculatePlanDistribution,
  generateRevenueTrendData,
  generateSubscriptionTrendData,
  calculateMonthlySubscriptions,
  calculateMonthlyRevenue,
  KPIData,
} from '@/lib/monitoring/kpi-calculations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/monitoring/kpis
 * Retorna todos os KPIs para o dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json(
        { error: 'Acesso restrito a administradores da plataforma.' },
        { status: 403 }
      );
    }

    const [mrrData, conversionData, churnData, paymentSuccessData, planDistribution, revenueTrendArray, subscriptionTrendArray, monthlySubscriptions, monthlyRevenue] = await Promise.all([
      calculateMRR(),
      calculateConversionRate(),
      calculateChurnRate(),
      calculatePaymentSuccessRate(),
      calculatePlanDistribution(),
      generateRevenueTrendData(),
      generateSubscriptionTrendData(),
      calculateMonthlySubscriptions(),
      calculateMonthlyRevenue(),
    ]);

    const arpu = await calculateARPU(mrrData.mrr);
    const arpuPreviousMonth = mrrData.mrrPreviousMonth > 0 ? mrrData.mrrPreviousMonth / 1 : 0;
    const arpuTrend = arpuPreviousMonth > 0 ? ((arpu - arpuPreviousMonth) / arpuPreviousMonth) * 100 : 0;

    const revTrend = monthlyRevenue.last30Days > 0 
      ? ((monthlyRevenue.thisMonth - monthlyRevenue.last30Days) / monthlyRevenue.last30Days) * 100 
      : 0;

    const kpiData: KPIData = {
      mrr: Math.round(mrrData.mrr),
      mrrTrend: Math.round(mrrData.trend * 100) / 100,
      mrrPreviousMonth: Math.round(mrrData.mrrPreviousMonth),
      activeSubscriptions: monthlySubscriptions.newThisMonth,
      newSubscriptionsThisMonth: monthlySubscriptions.newThisMonth,
      subscriptionsLastMonth: monthlySubscriptions.lastMonth,
      subscriptionGrowthMoM: Math.round(monthlySubscriptions.growthMoM * 100) / 100,
      totalRevenueThisMonth: Math.round(monthlyRevenue.thisMonth),
      totalRevenueLast30Days: Math.round(monthlyRevenue.last30Days),
      revenueTrend: Math.round(revTrend * 100) / 100,
      conversionRate: Math.round(conversionData.conversionRate * 100) / 100,
      totalSignups: conversionData.totalSignups,
      totalConverted: conversionData.totalConverted,
      avgDaysToConversion: conversionData.avgDaysToConversion,
      churnRateThisMonth: Math.round(churnData.churnRate * 100) / 100,
      cancelledSubscriptionsThisMonth: churnData.cancelledCount,
      arpu: Math.round(arpu),
      arpuTrend: Math.round(arpuTrend * 100) / 100,
      paymentSuccessRate: Math.round(paymentSuccessData.successRate * 100) / 100,
      totalPaymentAttempts: paymentSuccessData.totalAttempts,
      successfulPayments: paymentSuccessData.successfulCount,
      failedPayments: paymentSuccessData.failedCount,
      planDistribution,
      revenueTrendData: revenueTrendArray,
      subscriptionTrendData: subscriptionTrendArray,
    };

    const response = NextResponse.json(kpiData);
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');

    return response;
  } catch (error) {
    console.error('Error calculating KPIs:', error);
    return NextResponse.json(
      { error: 'Failed to calculate KPIs' },
      { status: 500 }
    );
  }
}