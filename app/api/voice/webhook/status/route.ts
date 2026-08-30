// @ts-nocheck
/**
 * Twilio status callback: chamado quando a ligação termina.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const callSid = String(form.get('CallSid') || '');
  const callStatus = String(form.get('CallStatus') || '');
  const durationStr = String(form.get('CallDuration') || '0');
  const recordingUrl = String(form.get('RecordingUrl') || '') || null;

  if (!callSid) return NextResponse.json({ ok: true });

  const call = await prisma.voiceCall.findUnique({ where: { callSid } });
  if (!call) return NextResponse.json({ ok: true });

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
