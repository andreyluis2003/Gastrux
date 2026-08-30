// @ts-nocheck
/**
 * /api/pagamentos/alertas
 *
 * GET    - List payment alerts (paginated & filtered)
 * POST   - Create a payment alert (internal use; protected)
 *
 * Alerts are stored as Notification rows with payment-related types
 * (PAYMENT_RECEIVED / PAYMENT_FAILED / PAYMENT_PENDING) and a data.kind
 * of 'payment_alert'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPaymentAlert, notificationToAlert } from '@/lib/payment-alert-service';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

const PAYMENT_NOTIF_TYPES = ['PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'PAYMENT_PENDING'] as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const url = new URL(req.url);
    const q = url.searchParams;

    const filter = (q.get('filter') || 'all').toLowerCase(); // all | unread | critical
    const alertType = (q.get('alertType') || 'all').toLowerCase();
    const page = Math.max(1, Number(q.get('page')) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 50));
    const skip = (page - 1) * limit;

    const where: any = {
      type: { in: [...PAYMENT_NOTIF_TYPES] },
      archived: false,
    };

    if (filter === 'unread') where.read = false;
    if (filter === 'critical') where.severity = 'CRITICAL';

    // Filter by alertType inside the JSON data blob
    if (alertType !== 'all') {
      where.data = { path: ['alertType'], equals: alertType };
    }

    const [rows, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { restaurantId, type: { in: [...PAYMENT_NOTIF_TYPES] }, read: false, archived: false },
      }),
    ]);

    return NextResponse.json({
      alerts: rows.map(notificationToAlert),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error: any) {
    console.error('[GET /api/pagamentos/alertas] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await req.json();
    const {
      alertType,
      title,
      message,
      paymentId,
      gateway,
      amount,
      severity,
    } = body || {};

    if (!alertType || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: alertType, title, message' },
        { status: 400 }
      );
    }

    const result = await createPaymentAlert({
      alertType,
      title,
      message,
      paymentId: paymentId ?? null,
      gateway: gateway ?? null,
      amount: typeof amount === 'number' ? amount : 0,
      severity,
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
    }

    return NextResponse.json({ id: result.id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/pagamentos/alertas] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error?.message },
      { status: 500 }
    );
  }
}
