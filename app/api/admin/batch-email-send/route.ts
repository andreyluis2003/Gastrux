// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assignUserVariant } from '@/lib/email-ab-test';

interface EmailJob {
  userId: string;
  email: string;
  emailType: 'day3' | 'day7';
  variant?: any;
}

/**
 * Batch send emails with rate limiting and A/B testing
 * Used by daemon tasks for scheduled email sending
 */
export async function POST(request: NextRequest) {
  try {
    const adminSecret = request.headers.get('x-admin-secret');
    if (adminSecret !== process.env.ADMIN_CLEANUP_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailType, batchSize = 50, delayMs = 100 } = await request.json();

    if (!emailType || !['day3', 'day7'].includes(emailType)) {
      return NextResponse.json(
        { error: 'emailType must be day3 or day7' },
        { status: 400 }
      );
    }

    // Find users who haven't received this email yet
    const where: any = {};
    if (emailType === 'day3') {
      where.emailSentDay3 = false;
      where.createdAt = {
        lte: new Date(Date.now() - 72 * 60 * 60 * 1000), // 72 hours ago
        gte: new Date(Date.now() - 78 * 60 * 60 * 1000), // 78 hours ago
      };
    } else if (emailType === 'day7') {
      where.emailSentDay7 = false;
      where.createdAt = {
        lte: new Date(Date.now() - 168 * 60 * 60 * 1000), // 168 hours ago
        gte: new Date(Date.now() - 174 * 60 * 60 * 1000), // 174 hours ago
      };
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true },
      take: batchSize,
    });

    if (users.length === 0) {
      return NextResponse.json(
        { success: true, sent: 0, message: 'No users found to send emails to' },
        { status: 200 }
      );
    }

    // Send emails with rate limiting
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const user of users) {
      try {
        // Assign A/B test variant
        const variant = await assignUserVariant(user.id, emailType);

        // Call email endpoint
        const response = await fetch(
          `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/send-${emailType}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              email: user.email,
              userName: user.name,
              variant: variant?.variantLabel,
            }),
          }
        );

        if (response.ok) {
          results.sent++;
          
          // Update user flags
          if (emailType === 'day3') {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                emailSentDay3: true,
                emailDay3SentAt: new Date(),
              },
            });
          } else if (emailType === 'day7') {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                emailSentDay7: true,
                emailDay7SentAt: new Date(),
              },
            });
          }
        } else {
          results.failed++;
          results.errors.push(`User ${user.email}: ${response.statusText}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`User ${user.email}: ${String(error)}`);
      }

      // Rate limiting: delay between emails
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return NextResponse.json(
      {
        success: true,
        ...results,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Batch email send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
