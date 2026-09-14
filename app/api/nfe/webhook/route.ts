// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/webhook
 * Receive webhook callbacks from NF-e provider (Focus NFe, Brasil NFe, etc)
 * This handles status updates from SEFAZ. No browser session is present on
 * these calls - the target document (and therefore its restaurant) is
 * resolved from the payload's globally-unique accessKey below.
 *
 * accessKey is NOT a secret - it's printed on the fiscal document itself -
 * so resolving the document by it is not an authentication check. The
 * webhook URL must be registered with the provider including
 * ?token=<NFE_WEBHOOK_SECRET>, or any caller who obtains an accessKey could
 * forge a status change (e.g. mark an unauthorized document "authorized",
 * or cancel a real one).
 */
function verifyNFeWebhookToken(request: NextRequest): boolean {
  const secret = process.env.NFE_WEBHOOK_SECRET;
  if (!secret) return false;

  const provided = request.nextUrl.searchParams.get('token') || request.headers.get('x-webhook-token') || '';
  if (!provided) return false;

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyNFeWebhookToken(request)) {
      console.warn('[NF-e Webhook] Rejected: missing or invalid token');
      return NextResponse.json({ error: 'invalid token' }, { status: 401 });
    }

    const body = await request.json();

    // Log webhook for debugging
    console.log('NF-e Webhook received:', body);

    // Extract provider info
    const { accessKey, status, protocolNumber, statusDetail, webhookId } = body;

    if (!accessKey) {
      return NextResponse.json(
        { error: 'Missing accessKey' },
        { status: 400 }
      );
    }

    // Find document by access key
    const document = await prisma.nFeDocument.findUnique({
      where: { accessKey },
    });

    if (!document) {
      console.warn(`Document not found for access key: ${accessKey}`);
      return NextResponse.json(
        { message: 'Document not found' },
        { status: 404 }
      );
    }

    // Update document status based on provider response
    let newStatus = document.status;
    if (status === 'authorized' || status === 'approved') {
      newStatus = 'authorized';
    } else if (status === 'rejected' || status === 'denied') {
      newStatus = 'rejected';
    } else if (status === 'cancelled') {
      newStatus = 'cancelled';
    }

    const updated = await prisma.nFeDocument.update({
      where: { id: document.id },
      data: {
        status: newStatus,
        statusDescription: statusDetail,
        protocolNumber: protocolNumber || document.protocolNumber,
        authorizedAt: newStatus === 'authorized' ? new Date() : document.authorizedAt,
      },
    });

    // Log webhook
    await prisma.nFeLog.create({
      data: {
        documentId: document.id,
        eventType: 'webhook',
        description: `Webhook received: status=${status}`,
        webhookId,
        responseData: JSON.stringify(body),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Document ${document.id} updated to status: ${newStatus}`,
    });
  } catch (error) {
    console.error('Error processing NF-e webhook:', error);

    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}
