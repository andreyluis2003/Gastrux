import { prisma } from '@/lib/prisma';
import { parseBig } from './json';

/** Deterministic key: the same event resent by 99Food collapses into one row */
export function eventKey(body: any): { id: string; type: string; appShopId: string | null; orderId: string | null } {
  const type = String(body?.type ?? '');
  const appShopId = body?.app_shop_id != null ? String(body.app_shop_id) : null;
  const orderId = body?.data?.order_id != null ? String(body.data.order_id) : null;
  // shopBindStatus has no top-level app_shop_id: its shops come in data.appShopIDList
  let scope = orderId ?? appShopId;
  if (!scope && Array.isArray(body?.data?.appShopIDList)) {
    scope = body.data.appShopIDList.map(String).sort().join(',') || null;
  }
  let id = `${type}:${scope ?? '-'}:${String(body?.timestamp ?? '')}`;
  if (body?.data?.apply_id != null) id += `:${String(body.data.apply_id)}`;
  return { id, type, appShopId, orderId };
}

export class BadJsonError extends Error {}

/** Stores one signed webhook body (already verified). Throws on a database error so the route can ask for a resend */
export async function storeEvent(raw: string): Promise<{ stored: boolean }> {
  let body: any;
  try {
    body = parseBig(raw);
  } catch {
    throw new BadJsonError('bad json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadJsonError('bad json');
  const { id, type, appShopId, orderId } = eventKey(body);
  // Round-trip through JSON text keeps the 64-bit ids as strings in the stored payload
  const payload = JSON.parse(JSON.stringify(body));
  const res = await prisma.ninetynineEvent.createMany({
    data: [{ id, type, appShopId, orderId, payload }],
    skipDuplicates: true,
  });
  return { stored: res.count > 0 };
}
