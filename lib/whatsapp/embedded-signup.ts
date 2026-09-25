/**
 * Meta Graph API calls used by WhatsApp Embedded Signup v4
 * (developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup).
 *
 * These are the three server-side calls Meta requires after the client-side
 * FB.login({config_id}) popup finishes: exchange the short-lived `code` for
 * a business access token, subscribe this app to the customer's WABA so we
 * receive their webhooks, then register their phone number for Cloud API
 * messaging (required once per number before it can send/receive).
 */

const META_API_VERSION = 'v20.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function parseMetaError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data?.error?.message || `Meta API error ${res.status}`;
}

export async function exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
  const appId = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('WHATSAPP_APP_ID / WHATSAPP_APP_SECRET não configurados');
  }

  const url = `${META_BASE_URL}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(await parseMetaError(res));

  const data = await res.json();
  if (!data?.access_token) throw new Error('Resposta da Meta sem access_token');
  return { accessToken: data.access_token as string };
}

export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const url = `${META_BASE_URL}/${wabaId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(await parseMetaError(res));
}

export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin: string
): Promise<void> {
  const url = `${META_BASE_URL}/${phoneNumberId}/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
  if (!res.ok) throw new Error(await parseMetaError(res));
}
