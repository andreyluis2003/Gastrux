import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { platformWhatsapp } from '@/lib/agents/whatsapp/client';
import { listConversations } from '@/lib/agents/whatsapp/conversation';
import { suggestionStats } from '@/lib/agents/whatsapp/suggest';

export const dynamic = 'force-dynamic';

/** GET /api/admin/agent-conversations - the official number's conversations. Platform team only. */
export async function GET() {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  return NextResponse.json(
    { official: !!platformWhatsapp(), conversations: await listConversations(), suggestionStats: await suggestionStats() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
