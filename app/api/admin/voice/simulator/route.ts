// @ts-nocheck
/**
 * Web-based simulator. Permite testar o agente de voz via texto pelo admin.
 * Não envolve Twilio; grava VoiceCall com isSimulation=true.
 *
 * POST payload:
 *   { callId?: string, text: string, start?: boolean }
 * Retorna: { callId, reply, ended, reservationId? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { decideNextReply, buildGreeting } from '@/lib/voice/conversation-manager';
import { validateDraft, createReservationFromDraft } from '@/lib/voice/reservation-helper';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const { callId, text, start } = body as { callId?: string; text?: string; start?: boolean };

  let cfg = await prisma.voiceAgentConfig.findUnique({ where: { restaurantId } });
  if (!cfg) cfg = await prisma.voiceAgentConfig.create({ data: { restaurantId } });

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  // Inicia nova simulação
  if (start || !callId) {
    const call = await prisma.voiceCall.create({
      data: {
        restaurantId,
        status: 'IN_PROGRESS',
        fromNumber: 'simulator',
        toNumber: cfg.twilioPhoneNumber || 'simulator',
        isSimulation: true,
        transcript: [
          { role: 'agent', text: cfg.greeting, ts: new Date().toISOString() },
        ],
      },
    });
    return NextResponse.json({ callId: call.id, reply: cfg.greeting, ended: false });
  }

  if (!text) return NextResponse.json({ error: 'text obrigatório' }, { status: 400 });

  const call = await prisma.voiceCall.findUnique({ where: { id: callId } });
  if (!call || call.restaurantId !== restaurantId) {
    return NextResponse.json({ error: 'Chamada não encontrada' }, { status: 404 });
  }

  const transcript = Array.isArray(call.transcript) ? call.transcript : [];
  transcript.push({ role: 'user', text, ts: new Date().toISOString() });

  const decision = await decideNextReply(text, {
    restaurantName: restaurant?.name || 'o restaurante',
    greeting: cfg.greeting,
    goodbye: cfg.goodbye,
    outsideHoursMessage: cfg.outsideHoursMessage,
    allowReservations: cfg.allowReservations,
    allowTransfer: cfg.allowTransfer,
    transferMessage: cfg.transferMessage,
    maxPartySize: cfg.maxPartySize,
    minAdvanceMinutes: cfg.minAdvanceMinutes,
    maxAdvanceDays: cfg.maxAdvanceDays,
    businessHours: cfg.businessHours,
    currentDraft: call.draftData || {},
    transcript,
  });

  transcript.push({ role: 'agent', text: decision.reply, ts: new Date().toISOString() });

  let reservationId: string | null = null;
  let outcome: string | null = null;

  if (decision.ready && decision.draft) {
    const validation = validateDraft(decision.draft, {
      maxPartySize: cfg.maxPartySize,
      minAdvanceMinutes: cfg.minAdvanceMinutes,
      maxAdvanceDays: cfg.maxAdvanceDays,
    });
    if (validation.ok && validation.reservedAt) {
      try {
        const reservation = await createReservationFromDraft(
          restaurantId,
          decision.draft,
          validation.reservedAt,
          'simulator',
        );
        reservationId = reservation.id;
        outcome = 'RESERVATION_CREATED';
      } catch (err) {
        console.error('[voice-simulator] create reservation failed', err);
      }
    }
  }

  const shouldEnd = decision.endCall || outcome === 'RESERVATION_CREATED' || decision.intent === 'TRANSFER';

  if (decision.intent === 'TRANSFER') outcome = 'TRANSFERRED';
  if (!outcome && shouldEnd) outcome = 'HANG_UP';

  await prisma.voiceCall.update({
    where: { id: callId },
    data: {
      transcript,
      draftData: decision.draft || {},
      reservationId,
      outcome: outcome || undefined,
      status: shouldEnd ? 'COMPLETED' : 'IN_PROGRESS',
      endedAt: shouldEnd ? new Date() : undefined,
    },
  });

  return NextResponse.json({
    callId,
    reply: decision.reply,
    ended: shouldEnd,
    reservationId,
    intent: decision.intent,
    draft: decision.draft,
  });
}
