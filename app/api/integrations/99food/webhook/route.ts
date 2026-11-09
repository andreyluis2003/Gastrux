import { NextResponse } from 'next/server';
import { ninetynineConfig } from '@/lib/ninetynine/client';
import { verifyWebhookSign } from '@/lib/ninetynine/sign';
import { storeEvent, BadJsonError } from '@/lib/ninetynine/events-store';

export const dynamic = 'force-dynamic';

/** 99Food webhook: verify the signature, store, answer; processing happens later in the worker */
export async function POST(req: Request) {
  const cfg = ninetynineConfig();
  if (!cfg) return NextResponse.json({ errno: 1, errmsg: 'not configured' }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhookSign(raw, req.headers.get('didi-header-sign'), cfg.appSecret)) {
    return NextResponse.json({ errno: 1, errmsg: 'bad sign' }, { status: 401 });
  }

  try {
    await storeEvent(raw);
  } catch (e) {
    if (e instanceof BadJsonError) return NextResponse.json({ errno: 1, errmsg: 'bad json' }, { status: 400 });
    console.error('[99food webhook] store failed', e);
    return NextResponse.json({ errno: 1, errmsg: 'retry' }, { status: 500 });
  }
  return NextResponse.json({ errno: 0, errmsg: 'ok' });
}
