// @ts-nocheck
// Update webhook handler to create KDS orders

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOrderFromExternalOrder } from '@/lib/kds-integration';
import crypto from 'crypto';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const signature = req.headers.get('x-webhook-signature');
    const body = await req.text();

    // Parse platform type from URL or header
    const platform = req.headers.get('x-platform') || 'ifood';

    // Get integration
    const integration = await prisma.deliveryIntegration.findFirst({
      where: { restaurantId, platform: platform as any },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 400 }
      );
    }

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

    const data = JSON.parse(body);

    // Handle different webhook types
    if (data.type === 'order.new' || data.type === 'ORDER_RECEIVED') {
      const externalOrder = await prisma.externalOrder.create({
        data: {
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

      if (externalOrder) {
        await prisma.externalOrder.update({
          where: { id: externalOrder.id },
            restaurantId,
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
