import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail } from '@/lib/email-service';
import {
  buildWelcomeEmail,
  buildDay1Email,
  buildDay14Email,
  buildDay21Email,
  buildTrialEndingEmail,
} from '@/lib/email-templates/onboarding-sequence';
import { getPlatformAdminSession } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

interface SendResult {
  day: string;
  userId: string;
  email: string;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const NOTIF_IDS = {
  welcome: process.env.NOTIF_ID_EMAIL_DE_BOASVINDAS,
  day1: process.env.NOTIF_ID_EMAIL_ONBOARDING_DIA_1,
  day14: process.env.NOTIF_ID_EMAIL_ONBOARDING_DIA_14,
  day21: process.env.NOTIF_ID_EMAIL_ONBOARDING_DIA_21_UPGRADE,
  trialEnding: process.env.NOTIF_ID_TRIAL_TERMINANDO_AVISO,
};

/**
 * GET /api/email/onboarding-sequence
 * Returns users that are pending each onboarding email (dry run).
 */
export async function GET() {
  const now = new Date();
  const day1Threshold = new Date(now.getTime() - 1 * DAY_MS);
  const day14Threshold = new Date(now.getTime() - 14 * DAY_MS);
  const day21Threshold = new Date(now.getTime() - 21 * DAY_MS);
  const trialWarnWindowStart = new Date(now.getTime() + 2 * DAY_MS);
  const trialWarnWindowEnd = new Date(now.getTime() + 4 * DAY_MS);

  const base = { active: true };
  const [welcomeUsers, day1Users, day14Users, day21Users, trialEndingUsers] = await Promise.all([
    prisma.user.count({ where: { ...base, emailSentWelcome: false } }),
    prisma.user.count({
      where: { ...base, emailSentDay1: false, createdAt: { lte: day1Threshold } },
    }),
    prisma.user.count({
      where: { ...base, emailSentDay14: false, createdAt: { lte: day14Threshold } },
    }),
    prisma.user.count({
      where: { ...base, emailSentDay21: false, createdAt: { lte: day21Threshold } },
    }),
    prisma.user.count({
      where: {
        ...base,
        emailSentTrialEnding: false,
        subscriptionStatus: { in: ['trialing', 'trial'] },
        trialEndsAt: { gte: trialWarnWindowStart, lte: trialWarnWindowEnd },
      },
    }),
  ]);

  return NextResponse.json({
    pending: {
      welcome: welcomeUsers,
      day1: day1Users,
      day14: day14Users,
      day21: day21Users,
      trialEnding: trialEndingUsers,
    },
  });
}

/**
 * POST /api/email/onboarding-sequence
 * Runs the daily email sweep. Sends any missed emails to eligible users.
 * Can be triggered by cron/scheduled task with header x-internal-trigger.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';

  // Valid: (1) Bearer <CRON_SECRET> from scheduled task, or
  // (2) x-internal-trigger header from the admin UI — but this fires REAL upgrade
  // emails, so the header path additionally requires a platform-admin session
  // (role ADMIN). A restaurant tenant must never be able to trigger this.
  const hasValidBearer = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!hasValidBearer) {
    const { session } = await getPlatformAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const day1Threshold = new Date(now.getTime() - 1 * DAY_MS);
  const day14Threshold = new Date(now.getTime() - 14 * DAY_MS);
  const day21Threshold = new Date(now.getTime() - 21 * DAY_MS);
  const trialWarnWindowStart = new Date(now.getTime() + 2 * DAY_MS);
  const trialWarnWindowEnd = new Date(now.getTime() + 4 * DAY_MS);
  const results: SendResult[] = [];

  // 1. Welcome (immediately after signup, if not sent)
  if (NOTIF_IDS.welcome) {
    const users = await prisma.user.findMany({
      where: { active: true, emailSentWelcome: false, email: { not: '' } },
      select: { id: true, email: true, name: true },
      take: 200,
    });
    for (const u of users) {
      try {
        const { subject, html } = buildWelcomeEmail(u.name);
        await sendNotificationEmail({
          notificationId: NOTIF_IDS.welcome,
          subject,
          htmlBody: html,
          recipientEmail: u.email,
        });
        await prisma.user.update({
          where: { id: u.id },
          data: { emailSentWelcome: true, emailWelcomeSentAt: new Date() },
        });
        results.push({ day: 'welcome', userId: u.id, email: u.email, status: 'sent' });
      } catch (err: unknown) {
        results.push({
          day: 'welcome',
          userId: u.id,
          email: u.email,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 2. Day 1
  if (NOTIF_IDS.day1) {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        emailSentDay1: false,
        createdAt: { lte: day1Threshold },
        email: { not: '' },
      },
      select: { id: true, email: true, name: true },
      take: 200,
    });
    for (const u of users) {
      try {
        const { subject, html } = buildDay1Email(u.name);
        await sendNotificationEmail({
          notificationId: NOTIF_IDS.day1,
          subject,
          htmlBody: html,
          recipientEmail: u.email,
        });
        await prisma.user.update({
          where: { id: u.id },
          data: { emailSentDay1: true, emailDay1SentAt: new Date() },
        });
        results.push({ day: 'day1', userId: u.id, email: u.email, status: 'sent' });
      } catch (err: unknown) {
        results.push({
          day: 'day1',
          userId: u.id,
          email: u.email,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 3. Day 14
  if (NOTIF_IDS.day14) {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        emailSentDay14: false,
        createdAt: { lte: day14Threshold },
        email: { not: '' },
      },
      select: { id: true, email: true, name: true },
      take: 200,
    });
    for (const u of users) {
      try {
        const { subject, html } = buildDay14Email(u.name);
        await sendNotificationEmail({
          notificationId: NOTIF_IDS.day14,
          subject,
          htmlBody: html,
          recipientEmail: u.email,
        });
        await prisma.user.update({
          where: { id: u.id },
          data: { emailSentDay14: true, emailDay14SentAt: new Date() },
        });
        results.push({ day: 'day14', userId: u.id, email: u.email, status: 'sent' });
      } catch (err: unknown) {
        results.push({
          day: 'day14',
          userId: u.id,
          email: u.email,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 4. Day 21
  if (NOTIF_IDS.day21) {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        emailSentDay21: false,
        createdAt: { lte: day21Threshold },
        email: { not: '' },
      },
      select: { id: true, email: true, name: true, subscriptionTier: true },
      take: 200,
    });
    for (const u of users) {
      try {
        const { subject, html } = buildDay21Email(u.name, u.subscriptionTier);
        await sendNotificationEmail({
          notificationId: NOTIF_IDS.day21,
          subject,
          htmlBody: html,
          recipientEmail: u.email,
        });
        await prisma.user.update({
          where: { id: u.id },
          data: { emailSentDay21: true, emailDay21SentAt: new Date() },
        });
        results.push({ day: 'day21', userId: u.id, email: u.email, status: 'sent' });
      } catch (err: unknown) {
        results.push({
          day: 'day21',
          userId: u.id,
          email: u.email,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 5. Trial Ending
  if (NOTIF_IDS.trialEnding) {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        emailSentTrialEnding: false,
        subscriptionStatus: { in: ['trialing', 'trial'] },
        trialEndsAt: { gte: trialWarnWindowStart, lte: trialWarnWindowEnd },
        email: { not: '' },
      },
      select: { id: true, email: true, name: true, trialEndsAt: true },
      take: 200,
    });
    for (const u of users) {
      try {
        const daysLeft = Math.max(
          1,
          Math.ceil(((u.trialEndsAt?.getTime() ?? Date.now()) - now.getTime()) / DAY_MS)
        );
        const { subject, html } = buildTrialEndingEmail(u.name, daysLeft);
        await sendNotificationEmail({
          notificationId: NOTIF_IDS.trialEnding,
          subject,
          htmlBody: html,
          recipientEmail: u.email,
        });
        await prisma.user.update({
          where: { id: u.id },
          data: { emailSentTrialEnding: true, emailTrialEndingSentAt: new Date() },
        });
        results.push({ day: 'trialEnding', userId: u.id, email: u.email, status: 'sent' });
      } catch (err: unknown) {
        results.push({
          day: 'trialEnding',
          userId: u.id,
          email: u.email,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const summary = {
    total: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    byDay: {
      welcome: results.filter((r) => r.day === 'welcome').length,
      day1: results.filter((r) => r.day === 'day1').length,
      day14: results.filter((r) => r.day === 'day14').length,
      day21: results.filter((r) => r.day === 'day21').length,
      trialEnding: results.filter((r) => r.day === 'trialEnding').length,
    },
  };

  return NextResponse.json({ success: true, summary, results });
}
