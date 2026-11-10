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
  const include = { integration: { select: { platform: true, storeName: true } }, deliveryLogs: { orderBy: { createdAt: 'desc' as const }, take: 5 } };
  // A customer's open request (cancel, or a 99Food refund up to a day after delivery) is always on the first page,
  // however old the order: the screen shows its answer box whatever the status
  const openDisputes = !status && offset === 0
    ? prisma.externalOrder.findMany({
      where: { AND: [where, { disputeId: { not: null } }, { OR: [{ disputeExpiresAt: null }, { disputeExpiresAt: { gt: new Date() } }] }] },
      include, orderBy: { orderReceivedAt: 'desc' }, take: 50,
    })
    : Promise.resolve([]);
  const [page, disputed, total, restaurant] = await Promise.all([
    prisma.externalOrder.findMany({ where, include, orderBy: { orderReceivedAt: 'desc' }, take: limit, skip: offset }),
    openDisputes,
    prisma.externalOrder.count({ where }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { deliveryAutoAccept: true } }),
  ]);
  const onPage = new Set(page.map((o) => o.id));
  const orders = [...page, ...disputed.filter((o) => !onPage.has(o.id))];
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
