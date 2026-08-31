// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Webhook universal para receber status de entrega/leitura dos provedores.
 * Formato esperado (simplificado):
 *   { providerMsgId, status: "DELIVERED"|"READ"|"FAILED", errorMessage? }
 *
 * Take Blip e Zenvia possuem formatos próprios, aqui fazemos best-effort
 * para normalizar. Para Meta Cloud, o webhook existente de WhatsApp
 * (Phase 51) permanece em /api/whatsapp/webhook.
 */
export async function POST(req: NextRequest, { params }: any) {
  const providerRaw = (params?.provider || '').toUpperCase();
  const body = await req.json().catch(() => ({}));

  // Normalize payload by provider
  let providerMsgId: string | null = null;
  let status: string | null = null;
  let errorMessage: string | null = null;

  if (providerRaw === 'ZENVIA') {
    // Zenvia: MESSAGE_STATUS events with messageStatus
    providerMsgId = body?.messageId || body?.id || null;
    const s = (body?.messageStatus?.code || body?.status || '').toString().toUpperCase();
    if (s === 'DELIVERED') status = 'DELIVERED';
    else if (s === 'READ') status = 'READ';
    else if (s === 'REJECTED' || s === 'FAILED' || s === 'NOT_DELIVERED') status = 'FAILED';
    errorMessage = body?.messageStatus?.description || body?.messageStatus?.reason || null;
  } else if (providerRaw === 'TAKE_BLIP') {
    // Take Blip notifications: event = "received"|"consumed"|"failed"
    providerMsgId = body?.id || body?.notificationId || body?.referenceId || null;
    const ev = (body?.event || body?.type || '').toString().toLowerCase();
    if (ev === 'received' || ev === 'delivered') status = 'DELIVERED';
    else if (ev === 'consumed' || ev === 'read') status = 'READ';
    else if (ev === 'failed') status = 'FAILED';
    errorMessage = body?.reason?.description || null;
  } else {
    // Generic fallback
    providerMsgId = body?.providerMsgId || body?.messageId || null;
    status = (body?.status || '').toString().toUpperCase() || null;
    errorMessage = body?.errorMessage || null;
  }

  if (!providerMsgId || !status) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const recipient = await prisma.messageCampaignRecipient.findFirst({
    where: { providerMsgId },
  });
  if (!recipient) return NextResponse.json({ ok: true, unknown: true });

  const now = new Date();
  const patch: any = { status };
  if (status === 'DELIVERED') patch.deliveredAt = now;
  if (status === 'READ') patch.readAt = now;
  if (status === 'FAILED') {
    patch.failedAt = now;
    if (errorMessage) patch.errorMessage = errorMessage;
  }

  await prisma.messageCampaignRecipient.update({
    where: { id: recipient.id },
    data: patch,
  });

  // Bump campaign counters
  if (status === 'DELIVERED') {
    await prisma.messageCampaign.update({
      where: { id: recipient.campaignId },
      data: { totalDelivered: { increment: 1 } },
    });
  } else if (status === 'READ') {
    await prisma.messageCampaign.update({
      where: { id: recipient.campaignId },
      data: { totalRead: { increment: 1 } },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Health check
  return NextResponse.json({ ok: true });
}
