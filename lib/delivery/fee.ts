import { prisma } from '@/lib/prisma';

// Delivery fee of the public ordering link (owner request 2026-11-14): set by the restaurant, 0 = free delivery.
// It was a fixed R$ 5 in the page and the server took whatever the page sent.

export const DEFAULT_DELIVERY_FEE = 5;
export const MAX_DELIVERY_FEE = 500;

/** The fee the restaurant charges; the default when the restaurant is unknown. */
export async function restaurantDeliveryFee(restaurantId: string): Promise<number> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { deliveryFee: true } });
  return r ? r.deliveryFee : DEFAULT_DELIVERY_FEE;
}

/** Reads a fee typed by the owner ("5", "5,50", 0): rounded to cents, between 0 and the maximum. */
export function parseDeliveryFee(v: unknown): { ok: true; fee: number } | { ok: false; error: string } {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : NaN;
  if (typeof v === 'string' && !v.trim()) return { ok: false, error: 'Informe a taxa de entrega (0 para entrega grátis)' };
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Taxa de entrega inválida' };
  if (n > MAX_DELIVERY_FEE) return { ok: false, error: `A taxa de entrega pode ir até R$ ${MAX_DELIVERY_FEE}` };
  return { ok: true, fee: Math.round(n * 100) / 100 };
}
