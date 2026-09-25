// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/reservations/send-reminders - Send pending reminders (can be called by scheduler)
export async function POST(req: NextRequest) {
  try {
    // Verify request is from authorized source (scheduler or admin)
    const authHeader = req.headers.get('authorization');
    const secretKey = process.env.REMINDER_SECRET_KEY;

    if (!secretKey || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find reminders that need to be sent
    const now = new Date();
    const reminders = await prisma.reservationReminder.findMany({
      where: {
        isScheduled: true,
        sentAt: null,
        reservation: {
          reservedAt: {
            lte: new Date(now.getTime() + 25 * 60 * 60000), // Within 25 hours
            gte: new Date(now.getTime() + 10 * 60000), // At least 10 minutes away
          },
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
      },
      include: {
        reservation: {
          include: {
            guest: true,
            table: {
              include: { section: true },
            },
          },
        },
        guest: true,
      },
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const reminder of reminders) {
      try {
        const reservation = reminder.reservation;
        const guest = reminder.guest || reservation.guest;

        if (!guest) continue;

        // Determine if this reminder should be sent
        const minutesUntilReservation = Math.floor(
          (reservation.reservedAt.getTime() - now.getTime()) / 60000
        );

        let shouldSend = false;
        if (
          reminder.reminderType === 'REMINDER_24H' &&
          minutesUntilReservation >= 1380 && // 23 hours
          minutesUntilReservation <= 1440 // 24 hours
        ) {
          shouldSend = true;
        } else if (
          reminder.reminderType === 'REMINDER_1H' &&
          minutesUntilReservation >= 50 && // 50 minutes
          minutesUntilReservation <= 70 // 70 minutes
        ) {
          shouldSend = true;
        }

        if (!shouldSend) continue;

        // Send reminder via email
        if (reminder.channel === 'EMAIL' && guest.acceptsEmailReminders) {
          // Call email notification API
          const emailResponse = await fetch(
            `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/send-reminder`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'authorization': `Bearer ${secretKey}`,
              },
              body: JSON.stringify({
                email: guest.email,
                guestName: guest.name,
                reservationTime: reservation.reservedAt.toISOString(),
                tableNumber: reservation.table?.number,
                tableSectionName: reservation.table?.section?.name,
                partySize: reservation.partySize,
                reminderType: reminder.reminderType,
              }),
            }
          );

          if (!emailResponse.ok) {
            throw new Error(
              `Email API error: ${emailResponse.status}`
            );
          }

          sentCount++;
        }

        // Mark reminder as sent
        await prisma.reservationReminder.update({
          where: { id: reminder.id },
          data: {
            sentAt: now,
          },
        });
      } catch (error) {
        console.error(
          `Failed to send reminder ${reminder.id}:`,
          error
        );
        failedCount++;

        // Update with failure reason
        await prisma.reservationReminder.update({
          where: { id: reminder.id },
          data: {
            failureReason: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sentCount} reminders, ${failedCount} failed`,
      sentCount,
      failedCount,
      totalProcessed: reminders.length,
    });
  } catch (error) {
    console.error('Error sending reminders:', error);
    return NextResponse.json(
      { error: 'Failed to send reminders' },
      { status: 500 }
    );
  }
}
