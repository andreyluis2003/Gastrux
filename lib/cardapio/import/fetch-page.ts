import https from 'https';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { isPublicAddress } from '@/lib/delivery-orders/callback-url';

/**
 * Fetches a store page for the menu import (spec 2026-11-06 importar-cardapio-por-link §13): https on the public
 * internet only, the connection pinned to the checked IP (no DNS rebinding into the network), each redirect checked
 * again, 10 s and 5 MB at most. Same rule as the order API callbacks (lib/delivery-orders/callback.ts).
 */
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type PageResult = { ok: true; html: string; url: string } | { ok: false; error: string };

/**
 * The address to connect to: https, no user/password, not a local name, and a PUBLIC address among those the name
 * resolves to (IPv4 first). Unlike the callbacks, one public address is enough: the connection is pinned to it, and
 * networks with NAT64 also return a 64:ff9b:: address for every site (seen 2026-11-06).
 */
export async function resolveStoreAddress(raw: string): Promise<{ address: string; family: 4 | 6 } | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host)) return null;
  const literal = isIP(host);
  if (literal) return isPublicAddress(host) ? { address: host, family: literal as 4 | 6 } : null;
  try {
    const all = (await lookup(host, { all: true, verbatim: true })).filter((a) => isPublicAddress(a.address));
    const pick = all.find((a) => a.family === 4) ?? all[0];
    return pick ? { address: pick.address, family: pick.family as 4 | 6 } : null;
  } catch {
    return null;
  }
}

/** The network calls, apart so the tests replace them */
export const pageTransport = {
  resolve: resolveStoreAddress,
  get(req: { url: string; address: string; family: 4 | 6 }): Promise<{ status: number; location: string | null; body: string; tooBig: boolean }> {
    return new Promise((resolve, reject) => {
      const r = https.request(req.url, {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Gastrux-Cardapio/1; +https://gastrux.com)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'pt-BR,pt;q=0.9',
        },
        timeout: TIMEOUT_MS,
        lookup: (_host: string, opts: any, cb: any) => (opts?.all ? cb(null, [{ address: req.address, family: req.family }]) : cb(null, req.address, req.family)),
      }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: typeof res.headers.location === 'string' ? res.headers.location : null, body: '', tooBig: false });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            res.destroy();
            resolve({ status, location: null, body: '', tooBig: true });
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, location: null, body: Buffer.concat(chunks).toString('utf8'), tooBig: false }));
        res.on('error', reject);
      });
      r.on('timeout', () => r.destroy(new Error('tempo esgotado')));
      r.on('error', reject);
      r.end();
    });
  },
};

export async function fetchStorePage(raw: string): Promise<PageResult> {
  let url = raw.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await pageTransport.resolve(url);
    if (!target) return { ok: false, error: 'Use o link https da página de pedidos da sua loja.' };
    let res;
    try {
      res = await pageTransport.get({ url, address: target.address, family: target.family });
    } catch {
      return { ok: false, error: 'A página não respondeu. Confira o link e tente de novo.' };
    }
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = new URL(res.location, url).toString();
      continue;
    }
    if (res.tooBig) return { ok: false, error: 'A página é grande demais para ler.' };
    if (res.status === 403 || res.status === 429) return { ok: false, error: 'Esse site não deixa outros sistemas lerem a página.' };
    if (res.status !== 200) return { ok: false, error: `A página respondeu com erro (${res.status}). Confira o link.` };
    return { ok: true, html: res.body, url };
  }
  return { ok: false, error: 'O link redireciona vezes demais.' };
}
