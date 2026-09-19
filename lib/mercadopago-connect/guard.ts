import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

/**
 * Managing the Mercado Pago connection (start, callback, disconnect) moves
 * money, so it is strictly OWNER or ADMIN of the CURRENT restaurant. Unlike
 * requireAdminSession, a missing role is denied (same rule as the Stripe
 * Connect route).
 */
export async function requireConnectManager(): Promise<
  | { ok: true; session: any; restaurantId: string; userId: string }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireAdminSession();
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const user = auth.session.user as any;
  if (!['OWNER', 'ADMIN'].includes(user?.role || '')) {
    return { ok: false, status: 403, error: 'Apenas o dono ou administrador pode gerenciar pagamentos' };
  }
  if (!user?.id) return { ok: false, status: 403, error: 'Sessão inválida' };

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return { ok: false, status: 404, error: 'Restaurante não encontrado' };

  return { ok: true, session: auth.session, restaurantId, userId: user.id as string };
}
