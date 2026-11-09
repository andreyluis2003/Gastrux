import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { discardSuggestion, getOrCreateSuggestion } from '@/lib/agents/whatsapp/suggest';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** GET - the stored (or newly made) suggested reply for this conversation. Never fails the screen. Platform team only. */
export async function GET(_req: NextRequest, { params }: { params: { phone: string } }) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  try {
    return NextResponse.json(await getOrCreateSuggestion(params.phone), { headers: NO_STORE });
  } catch (err: any) {
    console.error('[agent-suggest] route failed:', err?.message);
    return NextResponse.json({ state: 'unavailable' }, { headers: NO_STORE });
  }
}

/** POST { action: 'regenerate' } or { action: 'discard', id } */
export async function POST(req: NextRequest, { params }: { params: { phone: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  const by = String(user.email || user.id || 'equipe');

  if (body?.action === 'regenerate') {
    try {
      return NextResponse.json(await getOrCreateSuggestion(params.phone, { regenerate: true, by }), { headers: NO_STORE });
    } catch (err: any) {
      console.error('[agent-suggest] route failed:', err?.message);
      return NextResponse.json({ state: 'unavailable' }, { headers: NO_STORE });
    }
  }
  if (body?.action === 'discard') {
    if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'Sugestão inválida' }, { status: 400 });
    await discardSuggestion(params.phone, body.id, by);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
