// @ts-nocheck
// Update webhook handler to create KDS orders

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOrderFromExternalOrder } from '@/lib/kds-integration';
import { canMoveExternalOrderStatus, isExternalOrderStatus } from '@/lib/delivery-integration/external-order-status';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * The kitchen order of an external order: the existing one when there is one, otherwise a newly
 * created one. When a simultaneous delivery creates it first, its unique externalOrderId makes this
 * creation fail, and the winner's order is returned. Null only when nothing could be created
 * (no matching recipe: see the bad-day scenario 3 notes).
 */
async function ensureKdsOrder(externalOrder: { id: string; internalOrderId: string | null }) {
  const find = () => prisma.order.findUnique({ where: { externalOrderId: externalOrder.id } });

  let order = await find();
  if (!order) order = (await createOrderFromExternalOrder(externalOrder.id)) ?? (await find());
  if (order && externalOrder.internalOrderId !== order.id) {
    await prisma.externalOrder.update({ where: { id: externalOrder.id }, data: { internalOrderId: order.id } }).catch(() => {});
  }
  return order;
}

function hasValidSignature(body: string, signature: string | null, secret: string | null | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(body).digest('hex'));
  const received = Buffer.from(signature.trim().toLowerCase());
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

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

    // Verify signature. This is the ONLY thing that authenticates the caller, so it is mandatory:
    // a missing header, a missing secret or a wrong signature all fail closed. (It used to run only
    // when the header was present, so leaving the header out skipped the check.)
    if (!hasValidSignature(body, signature, integration.webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = preParsed;

    // Handle different webhook types
    if (data.type === 'order.new' || data.type === 'ORDER_RECEIVED') {
      const platformOrderId = data.orderId || data.id;
      if (!platformOrderId) {
        return NextResponse.json({ error: 'orderId ausente no payload' }, { status: 400 });
      }

      // Idempotent: the platform re-sends the same order (retries, duplicates, simultaneous
      // deliveries) and every delivery must leave exactly ONE external order and ONE kitchen order,
      // and get a 2xx so it stops retrying. A previous attempt that saved the external order but
      // never created the kitchen order is healed here instead of failing on the unique key forever.
      let created = false;
      let externalOrder = await prisma.externalOrder.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: platformOrderId } },
      });
      if (!externalOrder) {
        try {
          externalOrder = await prisma.externalOrder.create({
            data: {
              restaurantId,
              integrationId: integration.id,
              externalOrderId: platformOrderId,
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
          created = true;
        } catch (error: any) {
          // A simultaneous delivery of the same order won the insert: use its row.
          if (error?.code !== 'P2002') throw error;
          externalOrder = await prisma.externalOrder.findUnique({
            where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: platformOrderId } },
          });
          if (!externalOrder) throw error;
        }
      }

      const kdsOrder = await ensureKdsOrder(externalOrder);

      return NextResponse.json(
        {
          success: true,
          ...(created ? {} : { duplicate: true }),
          externalOrderId: externalOrder.id,
          kdsOrderId: kdsOrder?.id,
        },
        { status: created ? 201 : 200 }
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

      if (!externalOrder) {
        // The status can overtake the order itself. Answer with a retryable error instead of 200,
        // otherwise the platform believes it was applied and never sends it again.
        return NextResponse.json(
          { error: 'Pedido ainda não recebido', code: 'ORDER_NOT_RECEIVED_YET' },
          { status: 503, headers: { 'Retry-After': '30' } }
        );
      }

      if (data.status) {
        if (!isExternalOrderStatus(data.status)) {
          return NextResponse.json({ error: 'status inválido' }, { status: 400 });
        }
        // A status only moves the order forward: a repeated or late older one is acknowledged and ignored.
        if (canMoveExternalOrderStatus(externalOrder.status, data.status)) {
          await prisma.externalOrder.updateMany({
            where: { id: externalOrder.id, status: externalOrder.status },
            data: { status: data.status },
          });
        } else {
          return NextResponse.json({ success: true, ignored: true, status: externalOrder.status });
        }
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
