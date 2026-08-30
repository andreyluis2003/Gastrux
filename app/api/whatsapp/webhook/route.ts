import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleInboundMessage, type InboundMessage } from '@/lib/whatsapp/bot';

export const dynamic = 'force-dynamic';

/**
 * Webhook da Meta Cloud API.
 *
 * - GET: validação (hub.challenge) durante setup do webhook.
 * - POST: recebe eventos (messages, statuses).
 *
 * Como o app é multi-tenant, a rota não conhece o restaurante antes de receber o payload.
 * Identificamos o restaurante pelo `phone_number_id` no body e também batemos o `verifyToken`
 * configurado no `WhatsAppConfig` daquele restaurante.
 */

// GET - validação do webhook
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token) {
    return new NextResponse('Missing parameters', { status: 400 });
  }

  // Busca um config ativo que tenha esse verifyToken
  const config = await (prisma as any).whatsAppConfig.findFirst({
    where: { verifyToken: token, isActive: true },
    select: { id: true, restaurantId: true },
  });

  if (!config) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return new NextResponse(challenge || '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// POST - recebe mensagens
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Formato Meta Cloud API
    // body.entry[].changes[].value.messages[] + .metadata.phone_number_id
    const entries: any[] = body?.entry || [];

    for (const entry of entries) {
      const changes: any[] = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value || {};
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Descobre o restaurante dono desse phoneNumberId
        const config = await (prisma as any).whatsAppConfig.findFirst({
          where: { phoneNumberId, isActive: true },
          select: { restaurantId: true },
        });
        if (!config) {
          console.warn('[wa-webhook] no active config for phone_number_id', phoneNumberId);
          continue;
        }

        const messages: any[] = value?.messages || [];
        const contacts: any[] = value?.contacts || [];

        for (const msg of messages) {
          const waMessageId: string = msg.id;
          const from: string = msg.from;
          const profileName: string | undefined = contacts.find((c) => c.wa_id === from)?.profile?.name;

          const inbound: InboundMessage = {
            from,
            waMessageId,
            profileName,
          };

          if (msg.type === 'text') {
            inbound.text = msg.text?.body || '';
          } else if (msg.type === 'interactive') {
            const inter = msg.interactive;
            if (inter?.type === 'button_reply') {
              inbound.buttonId = inter.button_reply?.id;
              inbound.text = inter.button_reply?.title;
            } else if (inter?.type === 'list_reply') {
              inbound.listId = inter.list_reply?.id;
              inbound.text = inter.list_reply?.title;
            }
          } else if (msg.type === 'button') {
            // Respostas a templates com botões
            inbound.buttonId = msg.button?.payload;
            inbound.text = msg.button?.text;
          } else {
            inbound.text = `[${msg.type}]`;
          }

          // Processa de forma síncrona mas com timeout suave
          try {
            await handleInboundMessage(config.restaurantId, inbound);
          } catch (err: any) {
            console.error('[wa-webhook] handleInboundMessage error:', err?.message);
          }
        }

        // Statuses (entregue/lido) ignorados por enquanto
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[wa-webhook] error:', err?.message || err);
    return NextResponse.json({ ok: false }, { status: 200 }); // Retorna 200 sempre para Meta não reenviar
  }
}
