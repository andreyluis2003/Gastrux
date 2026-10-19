import { prisma } from '@/lib/prisma';
import { GRANTING_STATUSES } from '@/lib/billing/subscription-sync';

/**
 * Who may write (spec 2026-10-18 §5): internal accounts, a trial in time, or a paid plan. Everything else
 * is the read-only lock. 'starter' in the database now means "no plan".
 */
export type PlanState = 'internal' | 'trial' | 'paid' | 'locked';
export interface PlanFields {
  isInternal: boolean;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  /** End of the period already paid (mirrored from the subscription) */
  billingCycleEnd?: Date | null;
  /** The owner subscribed through Stripe / Mercado Pago during the trial: the gateway trial is a paid plan */
  subscribedInTrial?: boolean;
}

export const TRIAL_DAYS = 30;
// The texts live in an edge-safe file (no prisma) because middleware.ts imports them
export { LOCK_CODE, LOCK_MESSAGE } from './plan-lock-text';
const PAID_TIERS = ['pro', 'business', 'enterprise'];
const DAY_MS = 86_400_000;

export function trialEnd(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}

/**
 * What is left of the in-app trial, in whole days: a checkout made during the trial charges only when it
 * ends, and one made after it charges at once (final review I-3: it used to add 30 more days)
 */
export function remainingTrialDays(r: Pick<PlanFields, 'subscriptionStatus' | 'trialEndsAt'>, now = new Date()): number {
  if (r.subscriptionStatus !== 'trialing' || !r.trialEndsAt || r.trialEndsAt.getTime() <= now.getTime()) return 0;
  return Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
}

export function planAccess(r: PlanFields, now = new Date()): { state: PlanState; locked: boolean; daysLeft: number | null } {
  if (r.isInternal) return { state: 'internal', locked: false, daysLeft: null };
  if (r.subscriptionStatus === 'trialing') {
    // No 'faltam N dias / Escolher plano' bar, and no lock if the gateway's first charge is answered late:
    // a failed charge comes back as past_due or canceled
    if (r.subscribedInTrial) return { state: 'paid', locked: false, daysLeft: null };
    if (r.trialEndsAt && r.trialEndsAt.getTime() > now.getTime()) {
      return { state: 'trial', locked: false, daysLeft: Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / DAY_MS) };
    }
    return { state: 'locked', locked: true, daysLeft: 0 };
  }
  if (PAID_TIERS.includes(String(r.subscriptionTier))) {
    if (r.subscriptionStatus === 'active' || r.subscriptionStatus === 'past_due') return { state: 'paid', locked: false, daysLeft: null };
    // Canceled (Mercado Pago cancels at once): the plan runs to the end of the period already paid (spec §5)
    if (r.subscriptionStatus === 'canceled' && r.billingCycleEnd && r.billingCycleEnd.getTime() > now.getTime()) {
      return { state: 'paid', locked: false, daysLeft: null };
    }
  }
  return { state: 'locked', locked: true, daysLeft: null };
}

const PLAN_SELECT = { isInternal: true, subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true, billingCycleEnd: true, ownerId: true } as const;

export async function restaurantPlanAccess(restaurantId: string, now = new Date()) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: PLAN_SELECT });
  if (!r) return null;
  return planAccess({ ...r, subscribedInTrial: await subscribedInTrial(r) }, now);
}

/** The check of lib/billing/trial-reminders.ts; only a trial needs it (no query otherwise) */
export async function subscribedInTrial(r: { subscriptionStatus: string | null; ownerId: string }): Promise<boolean> {
  if (r.subscriptionStatus !== 'trialing') return false;
  return !!(await prisma.subscription.findFirst({ where: { userId: r.ownerId, status: { in: GRANTING_STATUSES } }, select: { id: true } }));
}

/**
 * The restaurant a user works in: currentRestaurantId, else the first active membership (the choice of
 * lib/whatsapp/get-restaurant.ts). It only decides which plan to read; access itself is checked by each route.
 */
export async function currentRestaurantIdOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { where: { isActive: true }, select: { restaurantId: true }, orderBy: { restaurantId: 'asc' }, take: 1 } },
  });
  return user?.currentRestaurantId ?? user?.restaurants[0]?.restaurantId ?? null;
}
