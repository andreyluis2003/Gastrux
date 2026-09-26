import { prisma } from '@/lib/prisma';
import { lineTotalCents } from './line-total';

/**
 * What a table tab costs right now, in cents (null when the tab does not exist in this restaurant).
 * Same rule as the PIX amount and the comanda screen: (price + modifiers) x quantity per line.
 */
export async function getSessionTotalCents(
  restaurantId: string,
  sessionId: string
): Promise<{ totalCents: number; tableNumber: number | null } | null> {
  const session = await prisma.orderSession.findFirst({
    where: { id: sessionId, restaurantId },
    select: {
      tableNumber: true,
      items: { select: { price: true, quantity: true, modifiers: { select: { priceAdjustment: true } } } },
    },
  });
  if (!session) return null;
  const totalCents = session.items.reduce(
    (sum, item) => sum + lineTotalCents(item.price, item.quantity, item.modifiers.map((m) => m.priceAdjustment)),
    0
  );
  return { totalCents, tableNumber: session.tableNumber };
}
