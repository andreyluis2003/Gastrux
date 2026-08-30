// @ts-nocheck
/**
 * Unified Payment API
 * POST /api/pagamentos/unified - Create payment through any gateway
 * GET  /api/pagamentos/unified - List payments with filters
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUnifiedPayment, listPayments, syncPaymentStatus, getPaymentAnalytics } from '@/lib/payment-unified';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      gateway,
      items,
      description,
      customer,
      metadata,
      applicationFeePercent,
      pixOnly = false,
    } = body;

    if (!gateway || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'gateway and items are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { restaurants: { include: { restaurant: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const restaurant = user.restaurants?.[0]?.restaurant;
    const restaurantId = restaurant?.id;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'No restaurant associated with user' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://gastrux.com';
    const paymentRef = `order-${Date.now()}`;

    const result = await createUnifiedPayment({
      restaurantId,
      gateway,
      items,
      description,
      customer: {
        email: customer?.email || session.user.email,
        name: customer?.name || user.name || undefined,
        phone: customer?.phone,
        document: customer?.document,
      },
      metadata: {
        ...metadata,
        pixOnly,
        userId: user.id,
      },
      successUrl: `${origin}/pagamentos/sucesso?ref=${paymentRef}`,
      failureUrl: `${origin}/pagamentos/falha?ref=${paymentRef}`,
      pendingUrl: `${origin}/pagamentos/pendente?ref=${paymentRef}`,
      webhookUrl: `${origin}/api/pagamentos/${gateway === 'MERCADO_PAGO' ? 'mp/webhook' : 'stripe/webhook'}`,
      externalReference: paymentRef,
      applicationFeePercent,
    });

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/unified', 201, duration);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/unified', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/unified',
    });
    console.error('[Unified Payment] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const gateway = url.searchParams.get('gateway') as any;
    const status = url.searchParams.get('status') || undefined;
    const fromDate = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : undefined;
    const toDate = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { restaurants: { include: { restaurant: true } } },
    });

    const restaurantId = user?.restaurants?.[0]?.restaurant?.id;

    const { payments, total } = await listPayments({
      restaurantId: restaurantId || undefined,
      gateway: gateway || undefined,
      status,
      fromDate,
      toDate,
      limit,
      offset,
    });

    return NextResponse.json({ payments, total, limit, offset });
  } catch (error) {
    console.error('[Unified Payment] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list payments' },
      { status: 500 }
    );
  }
}
