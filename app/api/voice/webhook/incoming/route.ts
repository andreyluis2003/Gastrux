// @ts-nocheck
/**
 * Twilio voice webhook: ligação de entrada.
 * Twilio envia body URLEncoded com: CallSid, From, To, CallStatus, etc.
 *
 * Multi-tenant: identifica o restaurante pelo `To` (twilioPhoneNumber).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { twimlSay } from '@/lib/voice/twiml';

export const dynamic = 'force-dynamic';

function twimlResp(xml: string) {
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const callSid = String(form.get('CallSid') || '');
  const fromNumber = String(form.get('From') || '');
  const toNumber = String(form.get('To') || '');

  // Identifica o restaurante
  const cfg = await prisma.voiceAgentConfig.findFirst({
    where: { twilioPhoneNumber: toNumber, isActive: true },
  });

  if (!cfg) {
    return twimlResp(
      twimlSay({
        text: 'Atendimento indisponível no momento. Por favor, tente novamente mais tarde.',
        hangup: true,
      }),
    );
  }

  // Checa business hours (simples, opcional)
  const now = new Date();
  const dayIdx = now.getDay().toString();
  const hhmm = now.toTimeString().slice(0, 5);
  const hours: any = cfg.businessHours || null;
  if (hours && hours[dayIdx]) {
    const { open, close } = hours[dayIdx] || {};
    if (open && close && (hhmm < open || hhmm > close)) {
      return twimlResp(
        twimlSay({
          text: cfg.outsideHoursMessage,
          voice: cfg.voice,
          language: cfg.language,
          hangup: true,
        }),
      );
    }
  }

  // Cria VoiceCall record
  await prisma.voiceCall.upsert({
    where: { callSid },
    update: { status: 'IN_PROGRESS' },
    create: {
      restaurantId: cfg.restaurantId,
      callSid,
      fromNumber,
      toNumber,
      status: 'IN_PROGRESS',
      transcript: [
        { role: 'agent', text: cfg.greeting, ts: new Date().toISOString() },
      ],
    },
  });

  // Incrementa stats
  await prisma.voiceAgentConfig.update({
    where: { id: cfg.id },
    data: {
      totalCalls: { increment: 1 },
      lastActivityAt: new Date(),
    },
  });

  // Origem para o webhook de gather
  const url = new URL(req.url);
  const gatherUrl = `${url.origin}/api/voice/webhook/gather?callSid=${encodeURIComponent(callSid)}`;

  return twimlResp(
    twimlSay({
      text: cfg.greeting,
      voice: cfg.voice,
      language: cfg.language,
      gatherActionUrl: gatherUrl,
    }),
  );
}
