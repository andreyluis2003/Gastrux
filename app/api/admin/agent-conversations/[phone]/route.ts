import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { WindowClosedError, openConversation, reply, windowOpen } from '@/lib/agents/whatsapp/conversation';

export const dynamic = 'force-dynamic';

/** Limit of a WhatsApp text message */
const MAX_TEXT = 4096;

/** GET - one conversation; opening it marks the client's messages as read. Platform team only. */
export async function GET(_req: NextRequest, { params }: { params: { phone: string } }) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  const [messages, open] = await Promise.all([openConversation(params.phone), windowOpen(params.phone)]);
  return NextResponse.json({ messages, windowOpen: open }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** POST { text } - answers the client by the official number, within the 24-hour window */
export async function POST(req: NextRequest, { params }: { params: { phone: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT) return NextResponse.json({ error: 'Escreva a mensagem' }, { status: 400 });

  try {
    const message = await reply(params.phone, text, String(user.email || user.id || 'equipe'));
    return NextResponse.json({ message });
  } catch (err: any) {
    if (err instanceof WindowClosedError) return NextResponse.json({ error: err.message, code: 'WINDOW_CLOSED' }, { status: 409 });
    console.error('[agent-conversations] reply failed:', err?.message);
    return NextResponse.json({ error: `Não foi possível enviar: ${err?.message || 'erro'}` }, { status: 424 });
  }
}
