import crypto from 'crypto';
import https from 'https';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { prisma } from '@/lib/prisma';
import { isPublicAddress, isSafeCallbackUrl } from './callback-url';
import { publicStatus } from './status';

/**
 * Status changes of the Gastrux order API, sent to the key's callback (plan 2026-10-23 api-de-pedidos, Task 6).
 * Signed `x-gastrux-signature: sha256=<hex>` (HMAC of the body with the key's secret). The address is resolved again
 * at send time and the connection goes only to that checked IP, with no redirect: a name that points inside the
 * network now (DNS rebinding) is never called (security review 2026-10-23).
 */
const TIMEOUT_MS = 5000;

export async function resolvePublicAddress(raw: string): Promise<{ address: string; family: 4 | 6 } | null> {
  if (!(await isSafeCallbackUrl(raw))) return null;
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(host);
  if (literal) return isPublicAddress(host) ? { address: host, family: literal as 4 | 6 } : null;
  try {
    const all = await lookup(host, { all: true, verbatim: true });
    if (!all.length || !all.every((a) => isPublicAddress(a.address))) return null;
    return { address: all[0].address, family: all[0].family as 4 | 6 };
  } catch {
    return null;
  }
}

/** The network call, apart so the tests replace it */
export const callbackTransport = {
  send(req: { url: string; address: string; family: 4 | 6; body: string; headers: Record<string, string>; timeoutMs: number }): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const r = https.request(req.url, {
        method: 'POST',
        headers: { ...req.headers, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(req.body)) },
        timeout: req.timeoutMs,
        // The connection goes to the address checked above, whatever the name resolves to now
        lookup: (_host: string, opts: any, cb: any) => (opts?.all ? cb(null, [{ address: req.address, family: req.family }]) : cb(null, req.address, req.family)),
      }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
      });
      r.on('timeout', () => r.destroy(new Error('tempo esgotado')));
      r.on('error', reject);
      r.end(req.body);
    });
  },
};

export async function notifyOrderStatus(externalOrderId: string): Promise<void> {
  try {
    const ext = await prisma.externalOrder.findUnique({
      where: { id: externalOrderId },
      select: { id: true, externalOrderId: true, status: true, apiKeyId: true, updatedAt: true, internalOrder: { select: { status: true, updatedAt: true } } },
    });
    if (!ext?.apiKeyId) return;
    const key = await prisma.orderApiKey.findUnique({ where: { id: ext.apiKeyId }, select: { callbackUrl: true, callbackSecret: true, revokedAt: true } });
    if (!key?.callbackUrl || key.revokedAt) return;
    const status = publicStatus(ext.status, ext.internalOrder?.status ?? null);
    const at = ext.internalOrder && ext.internalOrder.updatedAt > ext.updatedAt ? ext.internalOrder.updatedAt : ext.updatedAt;
    const body = JSON.stringify({ codigo: ext.externalOrderId, status, atualizadoEm: at.toISOString() });
    const signature = `sha256=${crypto.createHmac('sha256', key.callbackSecret).update(body).digest('hex')}`;
    let result: string;
    const target = await resolvePublicAddress(key.callbackUrl);
    if (!target) {
      result = 'endereço recusado (não é https público)';
    } else {
      try {
        const res = await callbackTransport.send({ url: key.callbackUrl, address: target.address, family: target.family, body, headers: { 'x-gastrux-signature': signature, 'user-agent': 'Gastrux-Pedidos/1' }, timeoutMs: TIMEOUT_MS });
        result = `HTTP ${res.status}`;
      } catch (e: any) {
        result = `falhou: ${String(e?.message ?? e).slice(0, 120)}`;
      }
    }
    await prisma.deliveryLog.create({
      data: { externalOrderId: ext.id, eventType: 'STATUS_CHANGED', newStatus: ext.status, message: `Aviso "${status}": ${result}`, eventTimestamp: new Date() },
    }).catch(() => {});
  } catch (e) {
    console.error('[delivery-orders] callback failed:', e);
  }
}
