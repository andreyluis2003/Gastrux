/**
 * Sends from the Gastrux official number (Help Flow's Cloud API number), separate from the restaurants' own
 * numbers in WhatsAppConfig. Off while WHATSAPP_PLATFORM_ACCESS_TOKEN or WHATSAPP_PLATFORM_PHONE_NUMBER_ID
 * is missing, as on homolog: the queue then keeps the wa.me link, so a test never reaches a real client.
 */
const GRAPH = 'https://graph.facebook.com/v26.0';

export function platformWhatsapp(): { phoneNumberId: string; accessToken: string } | null {
  const accessToken = process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

export const isPlatformNumber = (phoneNumberId: string) => platformWhatsapp()?.phoneNumberId === phoneNumberId;

async function send(payload: Record<string, unknown>): Promise<string> {
  const cfg = platformWhatsapp();
  if (!cfg) throw new Error('Número oficial não configurado');
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(15000),
  });
  const out: any = await res.json().catch(() => ({}));
  const id = out?.messages?.[0]?.id;
  if (!res.ok || !id) throw new Error(String(out?.error?.error_data?.details || out?.error?.message || `Meta respondeu ${res.status}`).slice(0, 300));
  return id;
}

export function sendPlatformText(to: string, text: string): Promise<string> {
  return send({ to, type: 'text', text: { body: text, preview_url: false } });
}

export function sendPlatformTemplate(to: string, t: { name: string; bodyParams: string[]; linkPath: string }): Promise<string> {
  return send({
    to,
    type: 'template',
    template: {
      name: t.name,
      language: { code: 'pt_BR' },
      components: [
        { type: 'body', parameters: t.bodyParams.map((text) => ({ type: 'text', text })) },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: t.linkPath }] },
      ],
    },
  });
}
