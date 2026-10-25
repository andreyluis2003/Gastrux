import { prisma } from '@/lib/prisma';

/**
 * Order.orderNumber is unique across ALL restaurants, so a kitchen order number is taken from the
 * last KDS-number globally (never from a per-restaurant count, which collides as soon as a second
 * restaurant sends its first order), and a concurrent writer that took the same number is retried.
 */

/**
 * Next free "KDS-####" number: one after the highest number in use (not after the newest order: with two
 * servers' clocks apart the newest order can hold a lower number, and every retry took the same one).
 * Ignores orders numbered in any other format.
 */
export async function nextKdsOrderNumber(): Promise<string> {
  const [row] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("orderNumber" FROM 5) AS INTEGER)) AS max
    FROM "orders" WHERE "orderNumber" ~ '^KDS-[0-9]{1,9}$'`;
  const current = Number(row?.max ?? 0);
  return `KDS-${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, '0')}`;
}

const isNumberTaken = (error: any) =>
  error?.code === 'P2002' && String(error?.meta?.target ?? '').includes('orderNumber');

/** Runs `create` with the next KDS number, retrying with a fresh number when another writer took it. */
export async function withKdsOrderNumber<T>(create: (orderNumber: string) => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await create(await nextKdsOrderNumber());
    } catch (error) {
      if (!isNumberTaken(error) || attempt >= attempts) throw error;
    }
  }
}
