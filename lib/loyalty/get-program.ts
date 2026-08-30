import { prisma } from '@/lib/prisma';

/**
 * Retorna (ou cria) o programa de fidelidade da loja informada.
 * Garante isolamento multi-tenant: cada restaurante tem o seu próprio programa.
 * Se restaurantId for nulo, cai no comportamento legado (programa global) — usado
 * apenas como fallback defensivo; as rotas devem sempre passar o restaurantId.
 */
export async function getOrCreateLoyaltyProgram(restaurantId?: string | null) {
  const where: any = { active: true };
  if (restaurantId) where.restaurantId = restaurantId;

  let program = await prisma.loyaltyProgram.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
  });

  if (!program) {
    program = await prisma.loyaltyProgram.create({
      data: {
        name: 'Cashback Gastrux',
        description: 'Ganhe pontos em cada pedido',
        pointsPerReal: 1,
        minPointsToRedeem: 10,
        pointsExpiryMonths: 12,
        ...(restaurantId ? { restaurantId } : {}),
      },
    });
  }

  return program;
}

/**
 * Descobre o restaurante dono de um cliente (para escopar fidelidade em fluxos
 * disparados por pedido, onde não há sessão do lojista).
 */
export async function getRestaurantIdForCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { restaurantId: true },
  });
  return customer?.restaurantId ?? null;
}
