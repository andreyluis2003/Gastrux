// @ts-nocheck
/**
 * Unified Refund API
 * POST /api/pagamentos/unified/refund
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createUnifiedRefund } from '@/lib/payment-unified';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to process refunds' },
        { status: 403 }
      );
    }

    const { paymentId, amount, reason, description } = await request.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    const result = await createUnifiedRefund(
      paymentId,
      amount,
      reason,
      session.user.id
    );

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/unified/refund', 200, duration);

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/unified/refund', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/unified/refund',
    });
    console.error('[Unified Refund] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process refund' },
      { status: 500 }
    );
  }
}
