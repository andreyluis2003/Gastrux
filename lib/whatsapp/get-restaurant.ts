import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Retorna o restaurante "ativo" do usuário logado.
 * - Preferimos `currentRestaurantId` se existir.
 * - Senão, o primeiro que ele é `owner` ou membro.
 */
export async function getCurrentRestaurantId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      currentRestaurantId: true,
      restaurants: { select: { restaurantId: true }, orderBy: { restaurantId: 'asc' }, take: 1 },
    },
  });
  if (!user) return null;
  if (user.currentRestaurantId) return user.currentRestaurantId;

  // Tenta achar um restaurante onde o user é owner (determinístico)
  const owned = await prisma.restaurant.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (owned) return owned.id;

  if (user.restaurants?.[0]?.restaurantId) return user.restaurants[0].restaurantId;
  return null;
}

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401, error: 'Não autenticado' };
  const role = (session.user as any)?.role;
  if (role && !['OWNER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
    return { ok: false as const, status: 403, error: 'Acesso negado' };
  }
  return { ok: true as const, session };
}
