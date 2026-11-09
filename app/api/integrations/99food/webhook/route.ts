import { NextResponse } from 'next/server';
import { ninetynineConfig } from '@/lib/ninetynine/client';
import { verifyWebhookSign } from '@/lib/ninetynine/sign';
import { storeEvent, BadJsonError } from '@/lib/ninetynine/events-store';

export const dynamic = 'force-dynamic';

const MAX_BODY = 1_048_576; // 1 MB

/** Raw body text, or null when it grows past the cap (counted while streaming when content-length is missing) */
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 99Food webhook: verify the signature, store, answer; processing happens later in the worker */
export async function POST(req: Request) {
  const cfg = ninetynineConfig();
  if (!cfg) return NextResponse.json({ errno: 1, errmsg: 'not configured' }, { status: 503 });

  const raw = await readCapped(req);
  if (raw === null) return NextResponse.json({ errno: 1, errmsg: 'too large' }, { status: 413 });
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
