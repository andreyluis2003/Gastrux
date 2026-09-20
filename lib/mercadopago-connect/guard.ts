import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

/**
 * Managing the Mercado Pago connection (start, callback, disconnect) decides
 * WHERE a restaurant's money lands, so it is authorized against the CURRENT
 * restaurant and not against the user's global JWT role (ruling R20).
 *
 * `session.user.role` is global: a user who is OWNER of restaurant X and merely
 * a cashier member of the current restaurant Y used to pass this check and
 * could redirect Y's money. Allowed now:
 *   - the current restaurant's `ownerId`, or
 *   - an ACTIVE `RestaurantUser` row for it whose role is OWNER or ADMIN, or
 *   - a platform admin (Gastrux staff), per isPlatformAdminIdentity.
 * Everything else is denied, including a session with no role
 * (requireAdminSession lets it through, the membership check does not).
 *
 * The return contract is unchanged: { ok: true, session, restaurantId, userId }
 * or { ok: false, status, error } with 401 / 403 / 404 as before.
 */

/** RestaurantUser.role is the UserRole enum; these are its management values. */
const MANAGEMENT_ROLES: UserRole[] = ['OWNER', 'ADMIN'] as UserRole[];

export async function requireConnectManager(): Promise<
  | { ok: true; session: any; restaurantId: string; userId: string }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireAdminSession();
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const user = auth.session.user as any;
  if (!user?.id) return { ok: false, status: 403, error: 'Sessão inválida' };

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return { ok: false, status: 404, error: 'Restaurante não encontrado' };

  const granted = { ok: true as const, session: auth.session, restaurantId, userId: user.id as string };

  // Gastrux staff may manage any restaurant's connection.
  if (isPlatformAdminIdentity(user.role, user.email)) return granted;

  const [ownsIt, membership] = await Promise.all([
    prisma.restaurant.findFirst({
      where: { id: restaurantId, ownerId: user.id as string },
      select: { id: true },
    }),
    prisma.restaurantUser.findFirst({
      where: { restaurantId, userId: user.id as string, isActive: true, role: { in: MANAGEMENT_ROLES } },
      select: { id: true },
    }),
  ]);

  if (!ownsIt && !membership) {
    return { ok: false, status: 403, error: 'Apenas o dono ou administrador pode gerenciar pagamentos' };
  }

  return granted;
}
