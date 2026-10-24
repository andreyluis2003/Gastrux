import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { KITCHEN_VISIBLE_ORDER_WHERE } from '@/lib/kds-visibility';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/integrations/orders - Pedidos de delivery (plan 2026-10-23 api-de-pedidos, Task 7). The integration
 * goes out as its platform and store name only: it used to carry the integration's apiKey and webhookSecret.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], 'Pedidos de delivery é da equipe do salão e do caixa');
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const platform = searchParams.get('platform');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
  // An order paid online shows once paid, as in the kitchen: an abandoned checkout of the site is not an order (final review 2026-10-24)
  const where: any = { restaurantId, OR: [{ internalOrder: { is: null } }, { internalOrder: { is: KITCHEN_VISIBLE_ORDER_WHERE } }] };
  if (status) where.status = status;
  if (platform) where.integration = { platform };
  const [orders, total, restaurant] = await Promise.all([
    prisma.externalOrder.findMany({
      where,
      include: { integration: { select: { platform: true, storeName: true } }, deliveryLogs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { orderReceivedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.externalOrder.count({ where }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { deliveryAutoAccept: true } }),
  ]);
  const keyIds = [...new Set(orders.map((o) => o.apiKeyId).filter((x): x is string => !!x))];
  const keyNames = new Map((await prisma.orderApiKey.findMany({ where: { id: { in: keyIds }, restaurantId }, select: { id: true, name: true } })).map((k) => [k.id, k.name]));
  return NextResponse.json({
    orders: orders.map((o) => ({ ...o, apiKeyName: o.apiKeyId ? keyNames.get(o.apiKeyId) ?? null : null })),
    total,
    limit,
    offset,
    autoAccept: restaurant?.deliveryAutoAccept !== false,
    canChangeSettings: [...MANAGER_ROLES, 'ADMIN'].includes(auth.member.role),
  });
}
