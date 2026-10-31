/**
 * What the activation agent reads about a trial account (spec 2026-10-27). Read fresh on every run,
 * never copied: the rules in ./rules.ts decide from these signals.
 */
import { prisma } from '@/lib/prisma';
import { clientStage } from '@/lib/admin/client-health';
import { getPlatformAdminEmails } from '@/lib/admin/guard';
import { onboardingStatus } from '@/lib/onboarding/first-steps';
import type { ActivationSignals } from './rules';

const DAY = 86_400_000;
/** Accounts older than this are past any trial nudge (30-day trial plus the "o que faltou?" question) */
const LOOKBACK_DAYS = 40;

export async function listTrialRestaurantIds(now: Date): Promise<string[]> {
  const rows = await prisma.restaurant.findMany({
    where: { status: 'TRIAL', isInternal: false, createdAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * DAY) } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.id);
}

const latest = (...dates: Array<Date | null | undefined>) =>
  dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);

export async function loadActivationSignals(restaurantId: string, now: Date): Promise<ActivationSignals | null> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true, name: true, ownerId: true, timezone: true, createdAt: true, trialEndsAt: true, status: true,
      subscriptionStatus: true, isInternal: true,
    },
  });
  if (!r) return null;

  const [owner, status, menuItems, closedBills, lastBill, firstBill, lastItem, actions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: r.ownerId },
      select: { id: true, name: true, email: true, whatsapp: true, whatsappMarketingConsentAt: true, businessType: true, lastSignInAt: true, onboardingEmailsOptOut: true },
    }),
    onboardingStatus(restaurantId, now),
    prisma.menuItem.count({ where: { restaurantId } }),
    prisma.orderSession.count({ where: { restaurantId, status: 'CLOSED' } }),
    prisma.orderSession.findFirst({ where: { restaurantId, status: 'CLOSED', closedAt: { not: null } }, orderBy: { closedAt: 'desc' }, select: { closedAt: true } }),
    prisma.orderSession.findFirst({ where: { restaurantId, status: 'CLOSED', closedAt: { not: null } }, orderBy: { closedAt: 'asc' }, select: { closedAt: true } }),
    prisma.menuItem.findFirst({ where: { restaurantId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.agentAction.findMany({
      where: { restaurantId, agent: 'activation' },
      orderBy: { createdAt: 'desc' },
      select: { trigger: true, createdAt: true, data: true },
    }),
  ]);
  if (!owner) return null;

  const platformEmails = getPlatformAdminEmails();
  const stage = clientStage({
    status: r.status, subscriptionStatus: r.subscriptionStatus, trialEndsAt: r.trialEndsAt, createdAt: r.createdAt,
    lastSignInAt: owner.lastSignInAt, menuItems, closedBills, closedBills30d: 0, mpStatus: null, openTickets: 0,
  });

  return {
    restaurantId: r.id,
    restaurantName: r.name,
    ownerId: owner.id,
    ownerName: owner.name,
    email: owner.email || null,
    whatsapp: owner.whatsapp,
    whatsappConsent: !!owner.whatsappMarketingConsentAt,
    businessType: owner.businessType,
    timezone: r.timezone,
    createdAt: r.createdAt,
    trialEndsAt: r.trialEndsAt,
    status: r.status,
    stage,
    lastActivityAt: latest(owner.lastSignInAt, lastBill?.closedAt, lastItem?.createdAt),
    firstSaleAt: firstBill?.closedAt ?? null,
    steps: status.steps,
    stepsDone: status.done,
    excluded: r.isInternal || owner.onboardingEmailsOptOut || platformEmails.includes(owner.email.toLowerCase()),
    sent: actions.map((a) => {
      const stepsDone = (a.data as { stepsDone?: unknown } | null)?.stepsDone;
      return { trigger: a.trigger, createdAt: a.createdAt, stepsDone: typeof stepsDone === 'number' ? stepsDone : null };
    }),
  };
}
