import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/security/credential-crypto';

/**
 * The iFood Merchant API (plan 2026-10-24 ifood, Task 2). Two kinds of app: the centralized one (the test app: one
 * client_credentials token that sees every linked store) and the distributed one (production: each store authorizes
 * Gastrux in the Partner Portal and has its own token, refreshed with its refresh token). A token is renewed only when it
 * expired or iFood answered 401, never in advance (homologation rule).
 */
const BASE = 'https://merchant-api.ifood.com.br';
const TIMEOUT_MS = 15_000;
const ACK_CHUNK = 2000;

export class IfoodError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type IfoodRequest = { method: 'GET' | 'POST' | 'PUT'; path: string; headers: Record<string, string>; body?: string };

/** The network call, apart so the tests replace it */
export const ifoodTransport = {
  async request(req: IfoodRequest): Promise<{ status: number; text: string }> {
    const res = await fetch(BASE + req.path, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, text: await res.text() };
  },
};

export function ifoodMode(): 'centralized' | 'distributed' {
  return process.env.IFOOD_APP_MODE === 'centralized' ? 'centralized' : 'distributed';
}

type Integration = { id: string };

let central: { token: string; expiresAt: number } | null = null;

/** Tests start each case without the cached centralized token */
export function resetIfoodTokenCache(): void {
  central = null;
}

function credentials() {
  const clientId = process.env.IFOOD_CLIENT_ID;
  const clientSecret = process.env.IFOOD_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new IfoodError('IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET não configurados', 0);
  return { clientId, clientSecret };
}

async function tokenRequest(fields: Record<string, string>): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const { clientId, clientSecret } = credentials();
  const res = await ifoodTransport.request({
    method: 'POST',
    path: '/authentication/v1.0/oauth/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, clientId, clientSecret }).toString(),
  });
  if (res.status >= 400) throw new IfoodError(`iFood recusou o acesso (${res.status})`, res.status);
  const j = JSON.parse(res.text);
  return { accessToken: j.accessToken, refreshToken: j.refreshToken, expiresIn: Number(j.expiresIn) || 0 };
}

async function saveStoreToken(integrationId: string, t: { accessToken: string; refreshToken?: string; expiresIn: number }) {
  await prisma.deliveryIntegration.update({
    where: { id: integrationId },
    data: {
      oauthAccessToken: encryptSecret(t.accessToken),
      ...(t.refreshToken ? { oauthRefreshToken: encryptSecret(t.refreshToken) } : {}),
      oauthExpiresAt: new Date(Date.now() + t.expiresIn * 1000),
    },
  });
}

/** The bearer for this call; `renew` forces a new one (after a 401) */
export async function tokenFor(integration: Integration | null, renew = false): Promise<string> {
  if (ifoodMode() === 'centralized') {
    if (!renew && central && central.expiresAt > Date.now()) return central.token;
    const t = await tokenRequest({ grantType: 'client_credentials' });
    central = { token: t.accessToken, expiresAt: Date.now() + t.expiresIn * 1000 };
    return t.accessToken;
  }
  if (!integration) throw new IfoodError('Loja do iFood sem integração', 0);
  const row = await prisma.deliveryIntegration.findUnique({
    where: { id: integration.id },
    select: { oauthAccessToken: true, oauthRefreshToken: true, oauthExpiresAt: true },
  });
  if (!row?.oauthAccessToken || !row.oauthRefreshToken) throw new IfoodError('A loja do iFood não está conectada', 401);
  if (!renew && row.oauthExpiresAt && row.oauthExpiresAt.getTime() > Date.now()) return decryptSecret(row.oauthAccessToken);
  const t = await tokenRequest({ grantType: 'refresh_token', refreshToken: decryptSecret(row.oauthRefreshToken) });
  await saveStoreToken(integration.id, t);
  return t.accessToken;
}

/** One call with the bearer; a 401 renews the token once and retries once */
export async function ifoodCall(
  integration: Integration | null,
  req: { method: 'GET' | 'POST' | 'PUT'; path: string; headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; json: any }> {
  const send = async (token: string) =>
    ifoodTransport.request({
      method: req.method,
      path: req.path,
      headers: { ...(req.headers ?? {}), Authorization: `Bearer ${token}`, ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    });
  let res = await send(await tokenFor(integration));
  if (res.status === 401) res = await send(await tokenFor(integration, true));
  if (res.status >= 400) throw new IfoodError(`iFood respondeu ${res.status} em ${req.path}: ${res.text.slice(0, 300)}`, res.status);
  let json: any = null;
  if (res.text) {
    try {
      json = JSON.parse(res.text);
    } catch {
      json = res.text;
    }
  }
  return { status: res.status, json };
}

export type IfoodEventPayload = { id: string; code: string; fullCode?: string; orderId?: string; merchantId: string; createdAt?: string; metadata?: any };

export async function pollEvents(integration: Integration | null, merchantIds: string[]): Promise<IfoodEventPayload[]> {
  const r = await ifoodCall(integration, { method: 'GET', path: '/events/v1.0/events:polling', headers: { 'x-polling-merchants': merchantIds.join(',') } });
  return r.status === 204 || !Array.isArray(r.json) ? [] : r.json;
}

export async function ackEvents(integration: Integration | null, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += ACK_CHUNK) {
    await ifoodCall(integration, { method: 'POST', path: '/events/v1.0/events/acknowledgment', body: ids.slice(i, i + ACK_CHUNK).map((id) => ({ id })) });
  }
}

const orderPath = (orderId: string, action?: string) => `/order/v1.0/orders/${encodeURIComponent(orderId)}${action ? `/${action}` : ''}`;

export async function getOrder(integration: Integration | null, orderId: string): Promise<any> {
  return (await ifoodCall(integration, { method: 'GET', path: orderPath(orderId) })).json;
}

const action = (name: string) => async (integration: Integration | null, orderId: string): Promise<void> => {
  await ifoodCall(integration, { method: 'POST', path: orderPath(orderId, name) });
};
export const confirmOrder = action('confirm');
export const startPreparation = action('startPreparation');
export const readyToPickup = action('readyToPickup');
export const dispatchOrder = action('dispatch');

export async function cancellationReasons(integration: Integration | null, orderId: string): Promise<Array<{ cancelCodeId: string; description: string }>> {
  const r = await ifoodCall(integration, { method: 'GET', path: orderPath(orderId, 'cancellationReasons') });
  return Array.isArray(r.json) ? r.json.map((x: any) => ({ cancelCodeId: String(x.cancelCodeId), description: String(x.description) })) : [];
}

export async function requestCancellation(integration: Integration | null, orderId: string, body: { reason: string; cancellationCode: string }): Promise<void> {
  await ifoodCall(integration, { method: 'POST', path: orderPath(orderId, 'requestCancellation'), body });
}

const dispute = (answer: 'accept' | 'reject') => async (integration: Integration | null, disputeId: string): Promise<void> => {
  await ifoodCall(integration, { method: 'POST', path: `/order/v1.0/disputes/${encodeURIComponent(disputeId)}/${answer}`, body: answer === 'reject' ? { reason: 'Pedido já em preparo' } : {} });
};
export const acceptDispute = dispute('accept');
export const rejectDispute = dispute('reject');

/** Step 1 of connecting a store (distributed app): the code the restaurant types in the Partner Portal */
export async function requestUserCode(): Promise<{ userCode: string; authorizationCodeVerifier: string; verificationUrlComplete: string; expiresIn: number }> {
  const { clientId } = credentials();
  const res = await ifoodTransport.request({
    method: 'POST',
    path: '/authentication/v1.0/oauth/userCode',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clientId }).toString(),
  });
  if (res.status >= 400) throw new IfoodError(`iFood recusou o pedido de código (${res.status})`, res.status);
  const j = JSON.parse(res.text);
  return { userCode: j.userCode, authorizationCodeVerifier: j.authorizationCodeVerifier, verificationUrlComplete: j.verificationUrlComplete, expiresIn: Number(j.expiresIn) || 0 };
}

/** Step 2: the authorization code the Portal gave becomes the store's tokens (the verifier is used once) */
export async function exchangeAuthorizationCode(integrationId: string, authorizationCode: string): Promise<void> {
  const row = await prisma.deliveryIntegration.findUnique({ where: { id: integrationId }, select: { oauthVerifier: true } });
  if (!row?.oauthVerifier) throw new IfoodError('Peça um código novo: clique em Conectar iFood de novo', 409);
  const t = await tokenRequest({ grantType: 'authorization_code', authorizationCode, authorizationCodeVerifier: decryptSecret(row.oauthVerifier) });
  await saveStoreToken(integrationId, t);
  await prisma.deliveryIntegration.update({ where: { id: integrationId }, data: { oauthVerifier: null } });
}

export async function listMerchants(integration: Integration | null): Promise<Array<{ id: string; name: string }>> {
  const r = await ifoodCall(integration, { method: 'GET', path: '/merchant/v1.0/merchants' });
  return Array.isArray(r.json) ? r.json.map((m: any) => ({ id: String(m.id), name: String(m.name ?? '') })) : [];
}
