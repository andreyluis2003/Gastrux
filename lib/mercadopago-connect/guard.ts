import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isPlatformStaffEmail } from '@/lib/admin/guard';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

/**
 * Restaurant-scoped management authorization (ruling R20). Anything that
 * changes how a restaurant gets paid (the Mercado Pago connection, which
 * payment methods it accepts) is authorized against the CURRENT restaurant and
 * not against the user's global JWT role.
 *
 * `session.user.role` is global: a user who is OWNER of restaurant X and merely
 * a cashier member of the current restaurant Y used to pass a role check and
 * could change Y's payments. Allowed:
 *   - the current restaurant's `ownerId`, or
 *   - an ACTIVE `RestaurantUser` row for it whose role is in the `roles` the
 *     caller passes, or
 *   - a platform admin (Gastrux staff), per the PLATFORM_ADMIN_EMAILS allowlist (isPlatformStaffEmail).
 * Everything else is denied. A session with no role passes requireAdminSession
 * but is then decided by the membership check alone, so a non-member is denied.
 *
 * The return contract: { ok: true, session, restaurantId, userId }
 * or { ok: false, status, error } with 401 / 403 / 404.
 */

export type RestaurantManagerResult =
  | { ok: true; session: any; restaurantId: string; userId: string }
  | { ok: false; status: number; error: string };

const DEFAULT_DENIED_MESSAGE = 'Apenas o dono ou administrador pode gerenciar pagamentos';

/** RestaurantUser.role is the UserRole enum; these are the roles that may manage the connection. */
const CONNECT_ROLES: UserRole[] = ['OWNER', 'ADMIN'] as UserRole[];

/**
 * @param roles Membership roles (besides the owner) allowed to pass.
 * @param deniedMessage Text of the 403 for a member outside `roles`.
 */
export async function requireRestaurantManager(
  roles: UserRole[],
  deniedMessage: string = DEFAULT_DENIED_MESSAGE
): Promise<RestaurantManagerResult> {
  const auth = await requireAdminSession();
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const user = auth.session.user as any;
  if (!user?.id) return { ok: false, status: 403, error: 'Sessão inválida' };

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return { ok: false, status: 404, error: 'Restaurante não encontrado' };

  const granted = { ok: true as const, session: auth.session, restaurantId, userId: user.id as string };

  // Gastrux staff may manage any restaurant.
  if (isPlatformStaffEmail(user.email)) return granted;

  const [ownsIt, membership] = await Promise.all([
    prisma.restaurant.findFirst({
      where: { id: restaurantId, ownerId: user.id as string },
      select: { id: true },
    }),
    prisma.restaurantUser.findFirst({
      where: { restaurantId, userId: user.id as string, isActive: true, role: { in: roles } },
      select: { id: true },
    }),
  ]);

  if (!ownsIt && !membership) {
    return { ok: false, status: 403, error: deniedMessage };
  }

  return granted;
}

/** Managing the Mercado Pago connection decides WHERE the money lands: owner or admin only. */
export function requireConnectManager(): Promise<RestaurantManagerResult> {
  return requireRestaurantManager(CONNECT_ROLES);
}
