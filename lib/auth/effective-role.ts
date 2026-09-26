import { prisma } from '@/lib/prisma';

/**
 * The role a signed-in user has RIGHT NOW in the restaurant they are working in, for
 * session.user.role. User.role is global and the JWT freezes it at login, so the owner of one
 * restaurant who is a cashier in another used to act as an owner everywhere, and a demoted or
 * removed member kept their old role until the next login.
 *
 * Same restaurant choice as getCurrentRestaurantId (lib/whatsapp/get-restaurant.ts): the selected
 * restaurant while still owned / actively a member there, else the first owned, else the first
 * active membership. Platform staff (ADMIN / SUPER_ADMIN) keep their global role. With no
 * restaurant at all (e.g. during signup) the global role is kept.
 */
const PLATFORM_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export async function resolveEffectiveRole(userId: string | undefined, globalRole: string | undefined): Promise<string | undefined> {
  if (!userId || (globalRole && PLATFORM_ROLES.includes(globalRole))) return globalRole;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentRestaurantId: true,
        restaurants: {
          where: { isActive: true },
          select: { restaurantId: true, role: true },
          orderBy: { restaurantId: 'asc' },
        },
      },
    });
    if (!user) return globalRole;

    const current = user.currentRestaurantId;
    if (current) {
      const ownsCurrent = await prisma.restaurant.findFirst({ where: { id: current, ownerId: userId }, select: { id: true } });
      if (ownsCurrent) return 'OWNER';
      const membership = user.restaurants.find((m) => m.restaurantId === current);
      if (membership) return membership.role;
    }
    const ownsAny = await prisma.restaurant.findFirst({ where: { ownerId: userId }, select: { id: true } });
    if (ownsAny) return 'OWNER';
    if (user.restaurants.length > 0) return user.restaurants[0].role;
    return globalRole;
  } catch (error) {
    console.error('[auth] could not resolve the restaurant role:', error);
    return globalRole;
  }
}
