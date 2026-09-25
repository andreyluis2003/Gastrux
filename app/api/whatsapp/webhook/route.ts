import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { handleInboundMessage, type InboundMessage } from '@/lib/whatsapp/bot';

export const dynamic = 'force-dynamic';

/**
 * Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body,
 * keyed with the Meta App Secret shared across every restaurant's WhatsApp
 * number). Without this, phoneNumberId - which is not a secret - is the
 * only thing standing between an attacker and forging inbound messages
 * (fake orders, fake loyalty/cashback redemptions, bot abuse) for any
 * restaurant.
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  try {
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

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
    const rawBody = await req.text();
    if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
      console.warn('[wa-webhook] rejected: missing or invalid X-Hub-Signature-256');
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const body = JSON.parse(rawBody);

    // Formato Meta Cloud API
    // body.entry[].changes[].value.messages[] + .metadata.phone_number_id
    const entries: any[] = body?.entry || [];

    for (const entry of entries) {
      const changes: any[] = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value || {};

        if (change?.field === 'account_update') {
          console.log('[wa-webhook] account_update', {
            event: value?.event,
            wabaId: value?.waba_info?.waba_id,
          });
          continue;
        }

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
