// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail, buildDailyReportEmail } from '@/lib/email-service';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    // Get statistics
    const [totalIngredients, criticalForecasts, todayMovements, stocks] = await Promise.all([
      prisma.ingredient.count({ where: { restaurantId, active: true } }),
      prisma.stockForecast.count({ where: { restaurantId, riskLevel: 'CRITICAL' } }),
      prisma.stockMovement.count({
        where: {
          restaurantId,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(),
          },
        },
      }),
      prisma.stock.findMany({
        where: { restaurantId },
        include: { ingredient: true },
      }),
    ]);

    // Calculate total stock value
    let totalValue = 0;
    stocks.forEach((stock) => {
      totalValue += stock.currentQuantity * stock.ingredient.referenceCost;
    });

    // Build and send email
    const htmlBody = buildDailyReportEmail(
      totalIngredients,
      criticalForecasts,
      todayMovements,
      totalValue
    );

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { email: true, ownerId: true },
    });
    const owner = restaurant?.ownerId
      ? await prisma.user.findUnique({ where: { id: restaurant.ownerId }, select: { email: true } })
      : null;
    const ownerEmail = owner?.email || restaurant?.email;
    if (!ownerEmail) {
      return NextResponse.json({ success: true, message: 'No recipient email configured' });
    }

    await sendNotificationEmail({
      notificationId: process.env.NOTIF_ID_RELATRIO_DIRIO_DE_OPERAES || '',
      subject: `📊 Relatório Diário - ${new Date().toLocaleDateString('pt-BR')}`,
      htmlBody,
      recipientEmail: ownerEmail,
    });

    // Log the report
    await prisma.auditLog.create({
      data: {
        entityType: 'DailyReport',
        entityId: 'system',
        action: 'CREATE',
        userId: session.user.id!,
        changes: JSON.stringify({
          totalIngredients,
          criticalForecasts,
          todayMovements,
          totalValue,
          sentTo: ownerEmail,
          sentAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Daily report sent to ${ownerEmail}`,
      stats: {
        totalIngredients,
        criticalForecasts,
        todayMovements,
        totalValue,
      },
    });
  } catch (error) {
    console.error('[DAILY REPORT ERROR]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send report' },
      { status: 500 }
    );
  }
}
