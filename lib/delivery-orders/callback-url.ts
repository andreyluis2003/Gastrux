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
    // Read the eight 16-bit groups: the URL parser writes an IPv4 inside IPv6 in hex (::ffff:a00:1), so a regex
    // on the dotted form misses it (security review 2026-10-23)
    const g = ipv6Groups(ip);
    if (!g) return false;
    const embeddedV4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    if (g.slice(0, 6).every((x) => x === 0)) return false; // ::, ::1 and the IPv4-compatible ::/96
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicAddress(embeddedV4(g[6], g[7])); // IPv4-mapped
    if (g[0] === 0x64 && g[1] === 0xff9b) return false; // NAT64 64:ff9b::/96 reaches any IPv4
    if (g[0] === 0x2002) return false; // 6to4 carries an IPv4
    if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
    if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
    if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
    if ((g[0] & 0xff00) === 0xff00) return false; // multicast
    return true;
  }
  return false;
}

/** The eight groups of an IPv6 address (with "::" and a trailing dotted IPv4 expanded), or null */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.replace(/%.*$/, '');
  const v4 = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = text.slice(0, v4.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const part = (s: string) => (s ? s.split(':').map((h) => parseInt(h, 16)) : []);
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail] : head;
  return groups.length === 8 && groups.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? groups : null;
}
