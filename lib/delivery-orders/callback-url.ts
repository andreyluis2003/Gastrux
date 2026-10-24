import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Where the Gastrux order API may send status changes (plan 2026-10-23 api-de-pedidos): https on the public internet
 * only. A callback pointing at the server's own network (localhost, 10.x, 192.168.x, 169.254.x metadata...) would let
 * a restaurant make the Gastrux server call machines it must never reach.
 */
export async function isSafeCallbackUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host)) return false;
  if (isIP(host)) return isPublicAddress(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local and cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false; // multicast and reserved
    return true;
  }
  if (isIP(ip) === 6) {
    if (ip === '::' || ip === '::1') return false;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip)) return false; // unique local, link-local, multicast
    return true;
  }
  return false;
}
