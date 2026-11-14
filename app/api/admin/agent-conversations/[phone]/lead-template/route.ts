import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { prisma } from '@/lib/prisma';
import { WINDOW_MS, recordOutbound, windowOpen } from '@/lib/agents/whatsapp/conversation';
import { sendPlatformTemplate } from '@/lib/agents/whatsapp/client';
import { phoneKey } from '@/lib/agents/whatsapp/numbers';
import { LEAD_TEMPLATE } from '@/lib/agents/whatsapp/templates';

export const dynamic = 'force-dynamic';

/** POST - sends the lead template ("pedido_informacoes") to a conversation whose 24-hour window is closed. Platform team only. */
export async function POST(_req: NextRequest, { params }: { params: { phone: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const key = phoneKey(params.phone);

  const last = await prisma.agentWhatsAppMessage.findFirst({ where: { phone: key }, orderBy: { createdAt: 'desc' } });
  if (!last) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

  if (await windowOpen(key)) {
    return NextResponse.json({ error: 'A conversa está dentro das 24 horas: responda normalmente, sem o modelo.', code: 'WINDOW_OPEN' }, { status: 409 });
  }
  const already = await prisma.agentWhatsAppMessage.findFirst({
    where: { phone: key, direction: 'OUT', messageType: 'template', text: LEAD_TEMPLATE.text, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
    select: { id: true },
  });
  if (already) {
    return NextResponse.json({ error: 'Este modelo já foi enviado para este número nas últimas 24 horas.', code: 'ALREADY_SENT' }, { status: 409 });
  }

  try {
    const waMessageId = await sendPlatformTemplate(last.waId, LEAD_TEMPLATE);
    const message = await recordOutbound({
      waId: last.waId,
      text: LEAD_TEMPLATE.text,
      waMessageId,
      messageType: 'template',
      userId: last.userId,
      restaurantId: last.restaurantId,
      sentBy: String(user.email || user.id || 'equipe'),
    });
    return NextResponse.json({ message });
  } catch (err: any) {
    console.error('[agent-conversations] lead template failed:', err?.message);
    return NextResponse.json({ error: `A Meta ainda não aprovou o modelo ou recusou o envio: ${err?.message || 'erro'}` }, { status: 502 });
  }
}
