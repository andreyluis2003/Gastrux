// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail } from '@/lib/email-service';
import { buildDay3OnboardingEmail, buildDay7OnboardingEmail } from '@/lib/email-onboarding';

export const dynamic = 'force-dynamic';

const NOTIF_IDS = {
  day3: process.env.NOTIF_ID_ONBOARDING_DAY_3_EMAIL,
  day7: process.env.NOTIF_ID_ONBOARDING_DAY_7_EMAIL,
};

export async function POST(req: NextRequest) {
  try {
    const { userId, day } = await req.json();

    if (!userId || !['3', '7'].includes(day)) {
      return NextResponse.json(
        { error: 'Invalid userId or day parameter' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build email content
    let subject: string;
    let htmlBody: string;
    let notificationId: string;

    if (day === '3') {
      subject = 'Primeiros passos no Gastrux - Guia rápido';
      htmlBody = buildDay3OnboardingEmail(user.name);
      notificationId = NOTIF_IDS.day3!;
    } else {
      subject = 'Recursos Premium aguardando você - 50% OFF';
      htmlBody = buildDay7OnboardingEmail(user.name);
      notificationId = NOTIF_IDS.day7!;
    }

    // Send email
    const emailResult = await sendNotificationEmail({
      notificationId,
      subject,
      htmlBody,
      recipientEmail: user.email,
    });

    if (emailResult.disabled) {
      return NextResponse.json({
        success: true,
        message: 'Email disabled by user',
        disabled: true,
      });
    }

    // Update user to mark email as sent
    const updateData =
      day === '3'
        ? {
            emailSentDay3: true,
            emailDay3SentAt: new Date(),
          }
        : {
            emailSentDay7: true,
            emailDay7SentAt: new Date(),
          };

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: `Day ${day} email sent successfully`,
    });
  } catch (error) {
    console.error('Error sending onboarding email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
