// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail, buildCriticalStockAlertEmail } from '@/lib/email-service';
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


    // Get critical forecasts
    const criticalForecasts = await prisma.stockForecast.findMany({
      where: { restaurantId, riskLevel: 'CRITICAL' },
      include: { ingredient: true },
    });

    if (criticalForecasts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No critical items found',
        sent: false,
      });
    }

    // Check if we already sent an alert in the last 6 hours (entityType must
    // match exactly - any other recent CREATE audit log for this restaurant
    // would otherwise falsely suppress every real alert)
    const lastAlert = await prisma.auditLog.findFirst({
      where: {
        restaurantId,
        action: 'CREATE',
        entityType: 'CriticalStockAlert',
      },
      orderBy: { createdAt: 'desc' },
    });

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    if (lastAlert && lastAlert.createdAt > sixHoursAgo) {
      return NextResponse.json({
        success: true,
        message: 'Alert already sent in the last 6 hours',
        sent: false,
        itemsCount: criticalForecasts.length,
      });
    }

    // Prepare email data
    const emailData = criticalForecasts.map((f) => ({
      code: f.ingredient.code,
      name: f.ingredient.name,
      currentStock: Number(f.currentStock),
      daysUntilEmpty: f.daysUntilEmpty,
      suggestedReorderQty: Number(f.suggestedReorderQty),
      standardUnit: f.ingredient.standardUnit,
    }));

    const htmlBody = buildCriticalStockAlertEmail(emailData);

    // Get this restaurant's own owner email - not a single hardcoded
    // platform-wide address, which would send every restaurant's critical
    // stock alerts to the same inbox. Restaurant.ownerId has no declared
    // Prisma relation, so the owner has to be looked up separately.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { email: true, ownerId: true },
    });
    const owner = restaurant?.ownerId
      ? await prisma.user.findUnique({ where: { id: restaurant.ownerId }, select: { email: true } })
      : null;
    const ownerEmail = owner?.email || restaurant?.email;
    if (!ownerEmail) {
      return NextResponse.json({ success: true, message: 'No recipient email configured', sent: false });
    }

    // Send email
    await sendNotificationEmail({
      notificationId: process.env.NOTIF_ID_ALERTA_DE_ESTOQUE_CRTICO || '',
      subject: `⚠️ Alerta de Estoque Crítico - ${criticalForecasts.length} insumo(s)`,
      htmlBody,
      recipientEmail: ownerEmail,
    });

    // Log the alert
    await prisma.auditLog.create({
      data: {
        entityType: 'CriticalStockAlert',
        entityId: 'system',
        action: 'CREATE',
        userId: session.user.id!,
        changes: JSON.stringify({
          itemsCount: criticalForecasts.length,
          items: emailData.map((d) => d.code),
          sentTo: ownerEmail,
          sentAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Critical stock alert sent to ${ownerEmail}`,
      sent: true,
      itemsCount: criticalForecasts.length,
    });
  } catch (error) {
    console.error('[CRITICAL STOCK ALERT ERROR]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send alert' },
      { status: 500 }
    );
  }
}
