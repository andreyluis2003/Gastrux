// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET: Retrieve all smart alert rules
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const alerts = await prisma.smartAlert.findMany({
      where: { restaurantId },
      include: {
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        ...a,
        conditions: JSON.parse(a.conditions),
        notificationUsers: a.notificationUsers
          ? JSON.parse(a.notificationUsers)
          : [],
      })),
    });
  } catch (error) {
    console.error('GET smart alerts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// POST: Create new smart alert rule
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await req.json();
    const {
      name,
      description,
      triggerType,
      conditions,
      shouldNotify,
      shouldEmail,
      notificationUsers,
      cooldownMinutes,
    } = body;

    const alert = await prisma.smartAlert.create({
      data: {
        restaurantId,
        name,
        description,
        triggerType,
        conditions: JSON.stringify(conditions),
        shouldNotify: shouldNotify ?? true,
        shouldEmail: shouldEmail ?? false,
        notificationUsers: notificationUsers
          ? JSON.stringify(notificationUsers)
          : null,
        cooldownMinutes: cooldownMinutes ?? 60,
        enabled: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        alert: {
          ...alert,
          conditions: JSON.parse(alert.conditions),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST smart alert error:', error);
    return NextResponse.json(
      { error: 'Failed to create alert rule' },
      { status: 500 }
    );
  }
}
