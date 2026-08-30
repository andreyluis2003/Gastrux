// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { monitorKPIsAndAlert, updateLastMonitoringCheckTime } from '@/lib/monitoring/alert-monitor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/monitoring/check-alerts
 * Verifica KPIs e envia alertas se necessario
 * Requer autenticação de OWNER
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json(
        { error: 'Unauthorized. Only OWNER can trigger alerts.' },
        { status: 403 }
      );
    }

    const result = await monitorKPIsAndAlert();
    await updateLastMonitoringCheckTime();

    return NextResponse.json({
      success: result.success,
      mrrDropDetected: result.mrrDropDetected,
      highChurnDetected: result.highChurnDetected,
      message: 'KPI monitoring check completed',
    });
  } catch (error) {
    console.error('Error in monitoring check:', error);
    return NextResponse.json(
      { error: 'Failed to check KPIs' },
      { status: 500 }
    );
  }
}
