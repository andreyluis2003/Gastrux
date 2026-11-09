import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/security/credential-crypto';
import { parseBig, stringifyBig } from './json';
import { signParams } from './sign';

/**
 * The 99Food open API (plan 2026-11-09 99food, Task 1). Store calls carry the per-store `auth_token` (kept encrypted on the
 * DeliveryIntegration row, `storeId` = app_shop_id); app-level v3 calls are signed with the app secret. Every answer is
 * {errno, errmsg, requestId|traceId, data}; ids are 64-bit so bodies go through json-bigint (ids are strings in Gastrux).
 */
const DEFAULT_BASE = 'https://openapi.99food.com';
const TIMEOUT_MS = 15_000;
const TOKEN_MARGIN_MS = 60_000;
const BIG_KEYS = ['app_id', 'order_id', 'shop_id', 'apply_id'];

export class NinetynineError extends Error {
  constructor(message: string, public errno: number, public requestId?: string) {
    super(message);
  }
}

/** The network call, apart so the tests replace it */
export const ninetynineTransport = {
  fetch: (...a: Parameters<typeof fetch>) => fetch(...a),
};

export function ninetynineConfig(): { baseUrl: string; appId: string; appSecret: string } | null {
  const appId = process.env.NINETYNINE_FOOD_APP_ID;
  const appSecret = process.env.NINETYNINE_FOOD_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { baseUrl: (process.env.NINETYNINE_FOOD_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ''), appId, appSecret };
}

function config() {
  const c = ninetynineConfig();
  if (!c) throw new NinetynineError('99Food não configurada', 0);
  return c;
}

type Envelope = { errno: number; errmsg?: string; requestId?: string; traceId?: string; data?: any };

async function send(method: 'GET' | 'POST', path: string, params: Record<string, unknown>, bigKeys: string[]): Promise<any> {
  const { baseUrl } = config();
  let url = `${baseUrl}/${path}`;
  const init: RequestInit = { method, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (method === 'GET') {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    url += `?${qs}`;
  } else {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = stringifyBig(params, bigKeys);
  }
  const res = await ninetynineTransport.fetch(url, init);
  const text = await res.text();
  let env: Envelope;
  try {
    env = parseBig(text);
  } catch {
    throw new NinetynineError(`99Food respondeu algo ilegível em ${path}`, -1);
  }
  const requestId = env.requestId ?? env.traceId;
  if (env.errno !== 0) {
    console.warn(`[99food] ${path} errno ${env.errno} requestId ${requestId ?? '-'}`);
    throw new NinetynineError(`99Food recusou ${path} (${env.errno}): ${env.errmsg ?? ''}`, Number(env.errno), requestId);
  }
  return env.data;
}

/** The store token: reused while valid (60 s margin), else fetched (after a refresh when `renew`) and stored encrypted */
export async function tokenFor(integrationId: string, renew = false): Promise<string> {
  const row = await prisma.deliveryIntegration.findUnique({
    where: { id: integrationId },
    select: { oauthAccessToken: true, oauthExpiresAt: true, storeId: true },
  });
  if (!row?.storeId) throw new NinetynineError('A loja do 99Food não está conectada', 0);
  if (!renew && row.oauthAccessToken && row.oauthExpiresAt && row.oauthExpiresAt.getTime() - TOKEN_MARGIN_MS > Date.now()) {
    return decryptSecret(row.oauthAccessToken);
  }
  const { appId, appSecret } = config();
  const creds = { app_id: appId, app_secret: appSecret, app_shop_id: row.storeId };
  if (renew) await send('GET', 'v1/auth/authtoken/refresh', creds, []);
  const data = await send('GET', 'v1/auth/authtoken/get', creds, []);
  const token = String(data.auth_token);
  await prisma.deliveryIntegration.update({
    where: { id: integrationId },
    data: { oauthAccessToken: encryptSecret(token), oauthExpiresAt: new Date(Number(data.token_expiration_time) * 1000) },
  });
  return token;
}

/** A store call: adds auth_token; errno 10101/10102 refreshes the token and retries once */
export async function storeCall<T = any>(
  integrationId: string,
  path: string,
  body: Record<string, unknown>,
  opts: { method?: 'GET' | 'POST'; bigKeys?: string[] } = {},
): Promise<T> {
  const method = opts.method ?? 'POST';
  const bigKeys = opts.bigKeys ?? BIG_KEYS;
  const attempt = async (renew: boolean) => send(method, path, { auth_token: await tokenFor(integrationId, renew), ...body }, bigKeys);
  try {
    return await attempt(false);
  } catch (e) {
    if (e instanceof NinetynineError && (e.errno === 10101 || e.errno === 10102)) return attempt(true);
    throw e;
  }
}

/** An app-level call (v3): carries app_id, timestamp and sign */
export async function appCall<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const { appId, appSecret } = config();
  const params: Record<string, unknown> = { app_id: appId, ...body, timestamp: Math.floor(Date.now() / 1000) };
  params.sign = signParams(params, appSecret);
  return send('POST', path, params, BIG_KEYS);
}

export async function getAuthorizationUrl(): Promise<string> {
  const { appId } = config();
  const data = await send('POST', 'v1/auth/authorizationpage/getUrl', { app_id: appId }, BIG_KEYS);
  return String(data.url);
}

export type AuthorizedShop = {
  shop_id: string;
  shop_name: string;
  app_shop_id: string;
  bound_flag: number;
  shop_phone: Array<{ type: number; phone: string; callingCode: string }>;
};

export async function listAuthorizedShops(page: number, size = 30): Promise<{ total_page: number; page_no: number; shops: AuthorizedShop[] }> {
  return appCall('v3/auth/authorization/getAuthorizedShops', { page_no: page, page_size: size });
}

export async function getOrderDetail(integrationId: string, orderId: string): Promise<{ order_id: string; order_info: any }> {
  return storeCall(integrationId, 'v1/order/order/detail', { order_id: orderId }, { method: 'GET' });
}

const orderAction = (name: string) => async (integrationId: string, orderId: string): Promise<void> => {
  await storeCall(integrationId, `v1/order/order/${name}`, { order_id: orderId });
};
export const confirmOrder = orderAction('confirm');
export const orderReady = orderAction('ready');
export const orderDelivered = orderAction('delivered');
export const confirmCashPayment = orderAction('payConfirm');

export async function cancelOrder(integrationId: string, orderId: string, reasonId: number, reason?: string): Promise<void> {
  await storeCall(integrationId, 'v1/order/order/cancel', { order_id: orderId, reason_id: reasonId, ...(reason ? { reason } : {}) });
}

export async function answerCancelApply(integrationId: string, orderId: string, applyId: string, agree: boolean, reason?: string): Promise<void> {
  await storeCall(integrationId, 'v1/order/apply/cancel', { order_id: orderId, apply_id: applyId, agree, ...(reason ? { reason } : {}) });
}

export async function answerRefundApply(
  integrationId: string,
  orderId: string,
  applyId: string,
  agree: boolean,
  refuse?: { baseReasonId: string; baseReason: string },
): Promise<void> {
  await storeCall(integrationId, 'v1/order/apply/refund', {
    order_id: orderId,
    apply_id: applyId,
    agree,
    ...(!agree && refuse ? { base_reason_id: refuse.baseReasonId, base_reason: refuse.baseReason } : {}),
  });
}

export async function setStoreStatus(integrationId: string, status: 'online' | 'pause'): Promise<void> {
  await storeCall(
    integrationId,
    'v1/shop/shop/setStatus',
    status === 'online' ? { store_status: 1 } : { store_status: 3, pause_time: 4, pause_reason_code: 1006 },
  );
}

export async function setConfirmMethod(integrationId: string, method: 1 | 2): Promise<void> {
  await storeCall(integrationId, 'v1/shop/shop/setconfirmmethod', { order_confirm_method: method });
}
