// @ts-nocheck
/**
 * Unified Payment API
 * POST /api/pagamentos/unified - Create payment through any gateway
 * GET  /api/pagamentos/unified - List payments with filters
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { prisma } from '@/lib/prisma';
import {
  createUnifiedPayment,
  listPayments,
  syncPaymentStatus,
  getPaymentAnalytics,
  OnlinePaymentUnavailableError,
  UNIFIED_GATEWAYS,
  UNIFIED_FILTER_GATEWAYS,
} from '@/lib/payment-unified';
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

    // Only gateways a client may ASK for. MERCADO_PAGO_CONNECT is created by
    // the connect flows: accepting it here would skip the connection check and
    // leave a DECLINED row behind, and an unknown value would reach Prisma as a
    // 500 instead of a 400.
    if (!UNIFIED_GATEWAYS.includes(gateway)) {
      return NextResponse.json(
        { error: `Invalid gateway. Allowed: ${UNIFIED_GATEWAYS.join(', ')}` },
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

    const restaurantId = await getCurrentRestaurantId();

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

    // An expected 409 is NOT a server error: record it as a 409 and keep it out
    // of Sentry, otherwise every unconnected restaurant looks like an outage.
    if (error instanceof OnlinePaymentUnavailableError) {
      trackApiCall('POST', '/api/pagamentos/unified', 409, duration);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }

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
    const gateway = url.searchParams.get('gateway') || undefined;
    // An unknown value would reach Prisma and come back as a 500.
    if (gateway && !UNIFIED_FILTER_GATEWAYS.includes(gateway as any)) {
      return NextResponse.json(
        { error: `Invalid gateway. Allowed: ${UNIFIED_FILTER_GATEWAYS.join(', ')}` },
        { status: 400 }
      );
    }
    const status = url.searchParams.get('status') || undefined;
    const fromDate = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : undefined;
    const toDate = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // The CURRENT restaurant, like POST: `restaurants[0]` is merely the first
    // membership, so a user working in their second restaurant would list the
    // first one's payments.
    const restaurantId = await getCurrentRestaurantId();

    // listPayments only applies a restaurantId filter when one is given -
    // without this guard, a user with no restaurant association would see
    // every restaurant's payments on the platform.
    if (!restaurantId) {
      return NextResponse.json({ error: 'No restaurant associated with user' }, { status: 400 });
    }

    const { payments, total } = await listPayments({
      restaurantId,
      gateway: gateway as any,
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
