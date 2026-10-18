import { currentRestaurantIdOf, restaurantPlanAccess } from '@/lib/billing/plan-access';

/** The lock travels in the JWT for the middleware (spec 2026-10-18 §6): read again every 5 minutes or on update() */
export const PLAN_CLAIM_TTL_MS = 5 * 60_000;

export async function refreshPlanClaim(token: Record<string, any>, opts: { now?: number; force?: boolean } = {}) {
  const now = opts.now ?? Date.now();
  if (!token.id) return token;
  if (!opts.force && typeof token.planCheckedAt === 'number' && now - token.planCheckedAt < PLAN_CLAIM_TTL_MS) return token;
  try {
    const rid = await currentRestaurantIdOf(String(token.id));
    const access = rid ? await restaurantPlanAccess(rid, new Date(now)) : null;
    token.planLocked = !!access?.locked;
    // For the trial / locked bar (session callback): no extra query per request
    token.planState = access?.state ?? null;
    token.trialDaysLeft = access?.daysLeft ?? null;
    token.planCheckedAt = now;
  } catch (error) {
    console.error('[plan-claim] could not read the plan; keeping the previous claim', error);
  }
  return token;
}
