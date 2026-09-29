// @ts-nocheck
/**
 * Twilio status callback: chamado quando a ligação termina.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formToParams, isValidTwilioRequest, publicRequestUrl } from '@/lib/voice/twilio-signature';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const callSid = String(form.get('CallSid') || '');
  const callStatus = String(form.get('CallStatus') || '');
  const durationStr = String(form.get('CallDuration') || '0');
  const recordingUrl = String(form.get('RecordingUrl') || '') || null;

  if (!callSid) return NextResponse.json({ ok: true });

  const call = await prisma.voiceCall.findUnique({
    where: { callSid },
    include: { restaurant: { select: { voiceAgentConfig: { select: { twilioAuthToken: true } } } } },
  });
  if (!call) return NextResponse.json({ ok: true });
  // Only Twilio may end or change a call
  const token = call.restaurant?.voiceAgentConfig?.twilioAuthToken;
  if (!isValidTwilioRequest(token, req.headers.get('x-twilio-signature'), publicRequestUrl(req.url), formToParams(form))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  const statusMap: Record<string, string> = {
    completed: 'COMPLETED',
    busy: 'FAILED',
    'no-answer': 'FAILED',
    failed: 'FAILED',
    canceled: 'FAILED',
  };
  const status = statusMap[callStatus] || 'IN_PROGRESS';

  await prisma.voiceCall.update({
    where: { callSid },
    data: {
      status,
      endedAt: new Date(),
      durationSec: parseInt(durationStr, 10) || null,
      recordingUrl: recordingUrl || undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
