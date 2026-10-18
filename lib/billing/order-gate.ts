import { restaurantPlanAccess } from '@/lib/billing/plan-access';

/** Customer orders (QR, delivery site, WhatsApp, external platforms) stop when the plan is locked (spec 2026-10-18 §6) */
export const ORDER_REFUSAL = { error: 'Este restaurante não está recebendo pedidos agora.', code: 'RESTAURANT_UNAVAILABLE' } as const;

export async function restaurantAcceptsOrders(restaurantId: string): Promise<boolean> {
  const access = await restaurantPlanAccess(restaurantId);
  return !!access && !access.locked;
}
