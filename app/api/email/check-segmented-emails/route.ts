// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/check-segmented-emails
 * Daemon que envia emails segmentados automaticamente
 * Precisa ser chamado via cron job externo ou scheduler
 */
export async function GET(request: NextRequest) {
  try {
    // Verify request is from authorized source (Vercel Cron, etc)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const appUrl = process.env.NEXTAUTH_URL || '';
    const results = {
      early_adopters_sent: 0,
      inactive_sent: 0,
      new_users_sent: 0,
      errors: [] as string[],
    };

    // 1. Send to Early Adopters every Monday at 10:00 AM
    const today = new Date();
    const dayOfWeek = today.getDay();
    const hour = today.getHours();

    if (dayOfWeek === 1 && hour === 10) {
      try {
        const response = await fetch(`${appUrl}/api/email/send-early-adopter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sendToAll: true }),
        });
        const result = await response.json();
        results.early_adopters_sent = result.sent || 0;
      } catch (error) {
        results.errors.push(`Early adopters error: ${error}`);
      }
    }

    // 2. Send to Inactive Users every Friday at 3:00 PM
    if (dayOfWeek === 5 && hour === 15) {
      try {
        const response = await fetch(`${appUrl}/api/email/send-inactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sendToAll: true }),
        });
        const result = await response.json();
        results.inactive_sent = result.sent || 0;
      } catch (error) {
        results.errors.push(`Inactive users error: ${error}`);
      }
    }

    // 3. Send to New Users every day at 8:00 AM
    if (hour === 8) {
      try {
        const response = await fetch(`${appUrl}/api/email/send-new-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sendToAll: true }),
        });
        const result = await response.json();
        results.new_users_sent = result.sent || 0;
      } catch (error) {
        results.errors.push(`New users error: ${error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Segmented email check completed',
      results,
    });
  } catch (error) {
    console.error('Error checking segmented emails:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to check segmented emails', error },
      { status: 500 }
    );
  }
}
