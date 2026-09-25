/**
 * Which orders the KITCHEN may see.
 *
 * An order the customer pays for online (PIX or card) is only prepared once the
 * payment is APPROVED: an abandoned, failed or duplicate unpaid order must never
 * reach the kitchen screen. Orders with no payment method (table/QR orders and
 * legacy rows) and pay-on-delivery orders are unaffected.
 *
 * This is a kitchen-only rule. The restaurant manager's order list, reports and
 * the like keep showing unpaid online orders, so do NOT use it there.
 */

/** Payment methods the customer pays online, before the food is made. */
export const ONLINE_PAYMENT_METHODS = ['ONLINE_PIX', 'ONLINE_CARD'] as const;

/**
 * Prisma `where` for Order rows the kitchen may list. Written as an explicit OR
 * (not NOT(...)) so that a NULL paymentMethod stays visible under SQL's
 * three-valued logic. Combine it with other conditions through AND.
 */
export const KITCHEN_VISIBLE_ORDER_WHERE = {
  OR: [
    { paymentMethod: null },
    { paymentMethod: { notIn: [...ONLINE_PAYMENT_METHODS] } },
    { paymentStatus: 'APPROVED' },
  ],
} as const;

/** The same rule as plain code (used by the tests to check the `where` above). */
export function isVisibleToKitchen(order: { paymentMethod?: string | null; paymentStatus?: string | null }): boolean {
  const method = order.paymentMethod ?? null;
  if (method === null) return true;
  if (!(ONLINE_PAYMENT_METHODS as readonly string[]).includes(method)) return true;
  return order.paymentStatus === 'APPROVED';
}
