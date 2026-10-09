/**
 * Plans (owner decision 2026-10-09): KDS, QR menu and the basic CRM on every plan, with limits that
 * keep the paid plans worth it: kitchen stations Starter 1 / Pro 3 / Business+ unlimited; customer
 * notes from Pro; campaigns, loyalty, multi-location and advanced reports from Business.
 */
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { BASE_PRICING_TIERS } from '@/lib/billing/pricing-tiers';

const on = (tier: string, f: any) => isTierFeatureEnabled(tier, f);

describe('plan matrix', () => {
  it.each(['starter', 'pro', 'business', 'enterprise'])('%s has the KDS, the QR menu and the basic CRM', (tier) => {
    expect([on(tier, 'kds'), on(tier, 'qrMenu'), on(tier, 'crm')]).toEqual([true, true, true]);
  });

  it('customer notes from Pro, campaigns from Business', () => {
    expect(['starter', 'pro', 'business', 'enterprise'].map((t) => on(t, 'crmNotes'))).toEqual([false, true, true, true]);
    expect(['starter', 'pro', 'business', 'enterprise'].map((t) => on(t, 'crmCampaigns'))).toEqual([false, false, true, true]);
  });

  it('loyalty, multi-location and advanced reports stay on Business and up', () => {
    for (const f of ['loyalty', 'multiLocation', 'advancedReports']) {
      expect(['starter', 'pro', 'business', 'enterprise'].map((t) => on(t, f))).toEqual([false, false, true, true]);
    }
  });

  it('sales per month: Starter 300, Pro 1.500, Business doubles Pro, Enterprise unlimited', () => {
    expect([BASE_PRICING_TIERS.STARTER, BASE_PRICING_TIERS.PRO, BASE_PRICING_TIERS.BUSINESS, BASE_PRICING_TIERS.ENTERPRISE].map((t) => t.limits.monthlySales))
      .toEqual([300, 1500, 3000, 999999]);
    expect(BASE_PRICING_TIERS.BUSINESS.limits.monthlySales).toBe(2 * BASE_PRICING_TIERS.PRO.limits.monthlySales);
  });

  it('label printing on every plan; the expiry control (labelExpiry) from Pro', () => {
    expect(['starter', 'pro', 'business', 'enterprise'].map((t) => on(t, 'labelExpiry'))).toEqual([false, true, true, true]);
  });

  it('kitchen stations: Starter 1, Pro 3, Business and Enterprise unlimited', () => {
    expect([
      BASE_PRICING_TIERS.STARTER.limits.kitchenStations,
      BASE_PRICING_TIERS.PRO.limits.kitchenStations,
      BASE_PRICING_TIERS.BUSINESS.limits.kitchenStations,
      BASE_PRICING_TIERS.ENTERPRISE.limits.kitchenStations,
    ]).toEqual([1, 3, 999999, 999999]);
  });
});
