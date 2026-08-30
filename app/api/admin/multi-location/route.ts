// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;

    const userRestaurants = await prisma.restaurantUser.findMany({
      where: { userId, isActive: true },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            status: true,
            subscriptionTier: true,
            _count: { select: { staffMembers: true, recipes: true, stocks: true } },
          },
        },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Sequential to avoid connection pool exhaustion
    const locations = [];
    for (const ur of userRestaurants) {
      const r = ur.restaurant;
      if (!r) continue;
      let ordersToday = 0;
      let orders30d = 0;
      let revenue30d = 0;
      try {
        const [a, b, c] = await Promise.all([
          prisma.order.count({ where: { restaurantId: r.id, createdAt: { gte: today } } }),
          prisma.order.count({ where: { restaurantId: r.id, createdAt: { gte: thirtyDaysAgo } } }),
          prisma.order.aggregate({
            where: { restaurantId: r.id, createdAt: { gte: thirtyDaysAgo } },
            _sum: { total: true },
          }),
        ]);
        ordersToday = a;
        orders30d = b;
        revenue30d = Number(c._sum?.total || 0);
      } catch (err) {
        console.error('[multi-location] metrics error for restaurant', r.id, err);
      }
      locations.push({
        id: r.id,
        name: r.name || 'Unidade sem nome',
        city: r.city || null,
        state: r.state || null,
        status: r.status || 'ACTIVE',
        subscriptionTier: r.subscriptionTier || 'starter',
        role: ur.role || 'OWNER',
        metrics: {
          ordersToday,
          orders30d,
          revenue30d,
          staffCount: r._count?.staffMembers || 0,
          menuItemsCount: r._count?.recipes || 0,
          stockItemsCount: r._count?.stocks || 0,
        },
      });
    }

    return NextResponse.json({
      locations,
      totalLocations: locations.length,
      totalRevenue30d: locations.reduce((a, l) => a + (l.metrics?.revenue30d || 0), 0),
      totalOrders30d: locations.reduce((a, l) => a + (l.metrics?.orders30d || 0), 0),
    });
  } catch (err: any) {
    console.error('[multi-location] GET error:', err);
    return NextResponse.json(
      { locations: [], totalLocations: 0, totalRevenue30d: 0, totalOrders30d: 0, error: err?.message || 'Erro interno' },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const role = (session.user as any).role;
    if (!['OWNER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Apenas OWNER pode criar novas unidades' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, city, state, address, phone, email } = body || {};
    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    try {
      const { checkTierLimit } = await import('@/lib/tier-guard');
      const currentRestaurant = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentRestaurantId: true },
      });
      if (currentRestaurant?.currentRestaurantId) {
        const check = await checkTierLimit(currentRestaurant.currentRestaurantId, 'locations');
        if (!check.allowed) {
          return NextResponse.json(
            {
              error: `Limite de unidades atingido (${check.current}/${check.limit}). Faça upgrade para ${check.upgradeRequired}.`,
            },
            { status: 403 },
          );
        }
      }
    } catch (e) {
      console.warn('[multi-location] tier check skipped:', e);
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        city: city || null,
        state: state || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        ownerId: userId,
        status: 'ACTIVE',
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
      },
    });

    await prisma.restaurantUser.create({
      data: {
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        permissions: ['ALL'],
        acceptedAt: new Date(),
        isActive: true,
      },
    });

    return NextResponse.json({ restaurant }, { status: 201 });
  } catch (err: any) {
    console.error('[multi-location] POST error:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao criar unidade' }, { status: 500 });
  }
}
