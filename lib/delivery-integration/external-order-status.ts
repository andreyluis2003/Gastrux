/**
 * Status flow of an order received from a delivery platform. The platform can repeat a status,
 * deliver it late, or out of order, so a status only moves the order FORWARD:
 * PENDING -> CONFIRMED -> PREPARING -> READY -> PICKED_UP -> DELIVERED. A step may be skipped
 * (an intermediate event can be lost). CANCELLED and REJECTED can happen until the order is
 * delivered; DELIVERED, CANCELLED and REJECTED are final. Pure (no I/O).
 */
export const EXTERNAL_ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;

export type ExternalOrderStatusName = (typeof EXTERNAL_ORDER_STATUSES)[number];

const FLOW: string[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED'];
const FINAL: string[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];

export function isExternalOrderStatus(value: unknown): value is ExternalOrderStatusName {
  return typeof value === 'string' && (EXTERNAL_ORDER_STATUSES as readonly string[]).includes(value);
}

export function canMoveExternalOrderStatus(from: string, to: string): boolean {
  if (from === to || FINAL.includes(from)) return false;
  if (to === 'CANCELLED' || to === 'REJECTED') return FLOW.includes(from);
  const a = FLOW.indexOf(from);
  const b = FLOW.indexOf(to);
  return a >= 0 && b > a;
}
