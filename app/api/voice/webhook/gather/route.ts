// @ts-nocheck
/**
 * Twilio gather webhook: recebe SpeechResult do cliente e devolve próxima resposta TTS.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { twimlSay } from '@/lib/voice/twiml';
import { decideNextReply } from '@/lib/voice/conversation-manager';
import { validateDraft, createReservationFromDraft } from '@/lib/voice/reservation-helper';

export const dynamic = 'force-dynamic';

function twimlResp(xml: string) {
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const form = await req.formData();
  const callSid = String(url.searchParams.get('callSid') || form.get('CallSid') || '');
  const speech = String(form.get('SpeechResult') || '').trim();
  const isTimeout = url.searchParams.get('timeout') === '1';

  const call = await prisma.voiceCall.findUnique({
    where: { callSid },
    include: { restaurant: { include: { voiceAgentConfig: true } } },
  });

  if (!call || !call.restaurant?.voiceAgentConfig) {
    return twimlResp(twimlSay({ text: 'Erro interno. Desculpe.', hangup: true }));
  }
  const cfg = call.restaurant.voiceAgentConfig;
  const gatherUrl = `${url.origin}/api/voice/webhook/gather?callSid=${encodeURIComponent(callSid)}`;

  if (isTimeout || !speech) {
    return twimlResp(
      twimlSay({
        text: 'Ainda está aí? Como posso ajudar?',
        voice: cfg.voice,
        language: cfg.language,
        gatherActionUrl: gatherUrl,
      }),
    );
  }

  const transcript = Array.isArray(call.transcript) ? call.transcript : [];
  transcript.push({ role: 'user', text: speech, ts: new Date().toISOString() });

  const decision = await decideNextReply(speech, {
    restaurantName: call.restaurant.name,
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

  // Salva novo draft e transcript
  let reservationId: string | null = null;
  let outcome: string | null = null;

  if (decision.intent === 'TRANSFER' && cfg.allowTransfer && cfg.transferNumber) {
    outcome = 'TRANSFERRED';
    await prisma.voiceCall.update({
      where: { callSid },
      data: { transcript, draftData: decision.draft || {}, outcome, status: 'COMPLETED', endedAt: new Date() },
    });
    await prisma.voiceAgentConfig.update({
      where: { id: cfg.id },
      data: { totalTransferred: { increment: 1 }, lastActivityAt: new Date() },
    });
    return twimlResp(
      twimlSay({
        text: decision.reply,
        voice: cfg.voice,
        language: cfg.language,
        transferTo: cfg.transferNumber,
      }),
    );
  }

  // Tenta criar reserva
  if (decision.ready && decision.draft) {
    const validation = validateDraft(decision.draft, {
      maxPartySize: cfg.maxPartySize,
      minAdvanceMinutes: cfg.minAdvanceMinutes,
      maxAdvanceDays: cfg.maxAdvanceDays,
    });
    if (validation.ok && validation.reservedAt) {
      try {
        const reservation = await createReservationFromDraft(
          call.restaurantId,
          decision.draft,
          validation.reservedAt,
          call.fromNumber || undefined,
        );
        reservationId = reservation.id;
        outcome = 'RESERVATION_CREATED';
        await prisma.voiceAgentConfig.update({
          where: { id: cfg.id },
          data: { totalReservations: { increment: 1 }, lastActivityAt: new Date() },
        });
      } catch (err) {
        console.error('[voice-gather] create reservation failed', err);
      }
    }
  }

  // Se deve finalizar
  const shouldEnd = decision.endCall || outcome === 'RESERVATION_CREATED';

  await prisma.voiceCall.update({
    where: { callSid },
    data: {
      transcript,
      draftData: decision.draft || {},
      reservationId,
      outcome: outcome || (shouldEnd ? 'HANG_UP' : undefined),
      status: shouldEnd ? 'COMPLETED' : 'IN_PROGRESS',
      endedAt: shouldEnd ? new Date() : undefined,
    },
  });

  if (shouldEnd) {
    return twimlResp(
      twimlSay({
        text: decision.reply,
        voice: cfg.voice,
        language: cfg.language,
        hangup: true,
      }),
    );
  }

  return twimlResp(
    twimlSay({
      text: decision.reply,
      voice: cfg.voice,
      language: cfg.language,
      gatherActionUrl: gatherUrl,
    }),
  );
}
