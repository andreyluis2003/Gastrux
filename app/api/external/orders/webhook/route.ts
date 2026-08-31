// @ts-nocheck
// Update webhook handler to create KDS orders

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOrderFromExternalOrder } from '@/lib/kds-integration';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-webhook-signature');
    const body = await req.text();

    // Parse platform type from URL or header
    const platform = req.headers.get('x-platform') || 'ifood';

    // This is an external platform webhook (iFood etc) - there is no logged-in
    // user session to resolve a restaurant from. The restaurant is identified
    // by matching the payload's storeId against the integration configured for
    // that platform (set up via /api/admin/integrations/delivery). Signature
    // verification against that integration's own secret is what actually
    // authenticates the caller.
    const preParsed = JSON.parse(body);
    const storeId = preParsed.storeId || preParsed.merchantId || null;
    if (!storeId) {
      return NextResponse.json({ error: 'storeId/merchantId ausente no payload' }, { status: 400 });
    }

    const integration = await prisma.deliveryIntegration.findFirst({
      where: { platform: platform as any, storeId },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 400 }
      );
    }
    const restaurantId = integration.restaurantId;

    // Verify signature
    if (integration.webhookSecret && signature) {
      const hash = crypto
        .createHmac('sha256', integration.webhookSecret)
        .update(body)
        .digest('hex');

      if (hash !== signature) {
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const data = preParsed;

    // Handle different webhook types
    if (data.type === 'order.new' || data.type === 'ORDER_RECEIVED') {
      const externalOrder = await prisma.externalOrder.create({
        data: {
          restaurantId,
          integrationId: integration.id,
          externalOrderId: data.orderId || data.id,
          externalCustomerId: data.customerId,
          status: 'PENDING',
          totalAmount: data.totalAmount || 0,
          deliveryFee: data.deliveryFee || 0,
          platformFee: data.platformFee || 0,
          customerName: data.customerName || 'Unknown',
          customerPhone: data.customerPhone || '',
          customerEmail: data.customerEmail,
          deliveryAddress: data.deliveryAddress || '',
          deliveryCity: data.deliveryCity,
          deliveryZipcode: data.deliveryZipcode,
          items: JSON.stringify(data.items || []),
          specialInstructions: data.specialInstructions,
        },
      });

      // Create KDS order
      const kdsOrder = await createOrderFromExternalOrder(externalOrder.id);

      return NextResponse.json(
        {
          success: true,
          externalOrderId: externalOrder.id,
          kdsOrderId: kdsOrder?.id,
        },
        { status: 201 }
      );
    }

    // Handle status updates
    if (data.type === 'order.status_changed' || data.type === 'ORDER_STATUS_CHANGED') {
      const externalOrder = await prisma.externalOrder.findFirst({
        where: {
          restaurantId,
          externalOrderId: data.orderId || data.id,
        },
      });

      if (externalOrder && data.status) {
        await prisma.externalOrder.update({
          where: { id: externalOrder.id },
          data: { status: data.status },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
