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
      restaurants: {
        where: { isActive: true },
        select: { restaurantId: true },
        orderBy: { restaurantId: 'asc' },
        take: 1,
      },
    },
  });
  if (!user) return null;

  // currentRestaurantId is only trustworthy while the user still has an
  // active membership (or ownership) there. Sessions are JWT-based and
  // outlive membership changes, so without this check a staff member
  // removed from a restaurant (RestaurantUser.isActive = false) would
  // keep full access to it for the rest of their session.
  if (user.currentRestaurantId) {
    const [stillMember, ownsIt] = await Promise.all([
      prisma.restaurantUser.findFirst({
        where: { restaurantId: user.currentRestaurantId, userId: user.id, isActive: true },
        select: { id: true },
      }),
      prisma.restaurant.findFirst({
        where: { id: user.currentRestaurantId, ownerId: user.id },
        select: { id: true },
      }),
    ]);
    if (stillMember || ownsIt) return user.currentRestaurantId;
  }

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
