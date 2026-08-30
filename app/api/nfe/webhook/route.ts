// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/webhook
 * Receive webhook callbacks from NF-e provider (Focus NFe, Brasil NFe, etc)
 * This handles status updates from SEFAZ
 */
export async function POST(request: NextRequest) {
  try {

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
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
