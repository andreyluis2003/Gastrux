/** The lock travels in the JWT, read again every 5 minutes or on update() (spec 2026-10-18 §6) */
jest.mock('@/lib/billing/plan-access', () => ({
  ...jest.requireActual('@/lib/billing/plan-access'),
  currentRestaurantIdOf: jest.fn(async () => 'r1'),
  restaurantPlanAccess: jest.fn(async () => ({ state: 'locked', locked: true, daysLeft: 0 })),
}));
import { refreshPlanClaim, PLAN_CLAIM_TTL_MS } from '@/lib/billing/plan-claim';
import { currentRestaurantIdOf, restaurantPlanAccess } from '@/lib/billing/plan-access';

it('refreshes when missing or older than 5 minutes, keeps it otherwise', async () => {
  const now = 1_000_000_000;
  const t: any = { id: 'u1' };
  await refreshPlanClaim(t, { now });
  expect(t).toMatchObject({ planLocked: true, planCheckedAt: now, planState: 'locked', trialDaysLeft: 0 });
  (restaurantPlanAccess as jest.Mock).mockResolvedValueOnce({ state: 'paid', locked: false, daysLeft: null });
  await refreshPlanClaim(t, { now: now + PLAN_CLAIM_TTL_MS - 1 });
  expect(t.planLocked).toBe(true); // still fresh, not read again
  await refreshPlanClaim(t, { now: now + PLAN_CLAIM_TTL_MS + 1 });
  expect(t.planLocked).toBe(false);
});

it('force (update() after paying) reads at once; no restaurant = not locked', async () => {
  const t: any = { id: 'u1', planLocked: true, planCheckedAt: Date.now() };
  (restaurantPlanAccess as jest.Mock).mockResolvedValueOnce({ state: 'paid', locked: false, daysLeft: null });
  await refreshPlanClaim(t, { force: true });
  expect(t.planLocked).toBe(false);
  (currentRestaurantIdOf as jest.Mock).mockResolvedValueOnce(null);
  await refreshPlanClaim(t, { force: true });
  expect(t.planLocked).toBe(false);
});

it('a database error keeps the previous claim', async () => {
  const t: any = { id: 'u1', planLocked: true, planCheckedAt: 0 };
  (restaurantPlanAccess as jest.Mock).mockRejectedValueOnce(new Error('db down'));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  await refreshPlanClaim(t, { now: PLAN_CLAIM_TTL_MS * 10 });
  expect(t.planLocked).toBe(true);
  spy.mockRestore();
});
