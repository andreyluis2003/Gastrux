// @ts-nocheck
/**
 * Mercado Pago Checkout API
 * POST /api/pagamentos/mp/checkout
 *
 * Creates a Mercado Pago preference for checkout
 * Supports: Card, PIX, Boleto, Wallet
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  createCheckoutPreference,
  createPixPreference,
} from '@/lib/mercado-pago';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { getMpClientForRestaurant, markNeedsReconnect } from '@/lib/mercadopago-connect/connection-service';
import { isUnauthorizedError, notificationUrlFor } from '@/lib/mercadopago-connect/payments';
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
      items,
      orderId,
      payer,
      externalReference,
      pixOnly = false,
      installments = 1,
      expirationMinutes = 30,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
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

    // Use the CURRENT restaurant (not merely the first membership): the payment
    // must be created with, and land in, that restaurant's own Mercado Pago account.
    const restaurantId = await getCurrentRestaurantId();
    const restaurant = user.restaurants?.find((r: any) => r.restaurant?.id === restaurantId)?.restaurant;

    const mpClient = restaurantId ? await getMpClientForRestaurant(restaurantId) : null;
    if (!restaurantId || !mpClient) {
      return NextResponse.json(
        {
          error: 'Conecte sua conta do Mercado Pago para receber pagamentos online.',
          code: 'ONLINE_PAYMENT_UNAVAILABLE',
        },
        { status: 409 }
      );
    }

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.unitPrice * item.quantity), 0);

    // Build URLs
    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://gastrux.com';

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        restaurantId,
        gateway: 'MERCADO_PAGO_CONNECT',
        amount: totalAmount,
        currency: 'BRL',
        method: 'MERCADO_PAGO',
        status: 'PENDING',
        description: `Order #${orderId || externalReference}`,
        customerEmail: payer?.email,
        customerName: payer?.name,
        customerPhone: payer?.phone,
        customerDocument: payer?.document?.number,
        metadata: JSON.stringify({ items, orderId, installments }),
      },
    });

    // Create MP preference
    const preferenceInput = {
      orderId: orderId || payment.id,
      items: items.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        pictureUrl: item.pictureUrl,
        categoryId: item.categoryId,
      })),
      payer: {
        email: payer?.email || session.user.email,
        name: payer?.name || user.name || undefined,
        phone: payer?.phone,
        document: payer?.document,
        address: payer?.address,
      },
      backUrls: {
        success: `${origin}/pagamentos/sucesso?payment_id=${payment.id}`,
        failure: `${origin}/pagamentos/falha?payment_id=${payment.id}`,
        pending: `${origin}/pagamentos/pendente?payment_id=${payment.id}`,
      },
      notificationUrl: notificationUrlFor(restaurantId),
      externalReference: payment.id,
      autoReturn: 'approved',
      statementDescriptor: restaurant?.name?.substring(0, 21) || 'RestauranteApp',
    };

    let preference;
    try {
      preference = pixOnly
        ? await createPixPreference(
            {
              ...preferenceInput,
              amount: totalAmount,
              description: items.map((i: any) => i.title).join(', '),
            },
            mpClient
          )
        : await createCheckoutPreference(preferenceInput, mpClient);
    } catch (error) {
      // A 401 means the restaurant's token is no longer usable. Without this
      // the connection stayed ACTIVE, the UI kept showing "Conectado" and every
      // card checkout failed with a generic 500 forever.
      if (isUnauthorizedError(error)) {
        await markNeedsReconnect(restaurantId, 'Mercado Pago rejeitou o token (401)');
        await prisma.payment
          .update({ where: { id: payment.id }, data: { status: 'DECLINED' } })
          .catch(() => {});
        trackApiCall('POST', '/api/pagamentos/mp/checkout', 409, Date.now() - startTime);
        return NextResponse.json(
          {
            error: 'Conecte sua conta do Mercado Pago para receber pagamentos online.',
            code: 'ONLINE_PAYMENT_UNAVAILABLE',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    // Create MercadoPagoTransaction record
    await prisma.mercadoPagoTransaction.create({
      data: {
        paymentId: payment.id,
        preferenceId: preference.id,
        externalReference: payment.id,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
        installments,
      },
    });

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/checkout', 201, duration);

    return NextResponse.json({
      paymentId: payment.id,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      externalReference: payment.id,
      totalAmount,
      expiresAt: new Date(Date.now() + expirationMinutes * 60000).toISOString(),
    }, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/checkout', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/checkout',
    });
    console.error('[MP Checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout preference' },
      { status: 500 }
    );
  }
}
