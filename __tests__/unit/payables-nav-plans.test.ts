/** Contas a pagar in the menu and the plans (spec 2026-10-18 contas a pagar §7, §8) */
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { navFor } from '@/lib/navigation/app-nav';
import { BASE_PRICING_TIERS } from '@/lib/billing/pricing-tiers';

const hrefs = (role: string) => navFor(role, false).flatMap((g) => g.links.map((l) => l.href));

it('series, alerts and NF-e boletos are Business and up', () => {
  for (const f of ['payableSeries', 'payableAlerts', 'payableFromNfe'] as const) {
    expect(isTierFeatureEnabled('pro', f)).toBe(false);
    expect(isTierFeatureEnabled('business', f)).toBe(true);
    expect(isTierFeatureEnabled('enterprise', f)).toBe(true);
  }
});

it('menu: owner and manager see Contas a pagar; cashier and cook do not', () => {
  expect(hrefs('OWNER')).toContain('/contas-a-pagar');
  expect(hrefs('MANAGER')).toContain('/contas-a-pagar');
  expect(hrefs('CASHIER')).not.toContain('/contas-a-pagar');
  expect(hrefs('COOK')).not.toContain('/contas-a-pagar');
});

it('the plans say it', () => {
  expect((BASE_PRICING_TIERS as any).PRO.features).toContain('Contas a pagar');
  expect((BASE_PRICING_TIERS as any).BUSINESS.features).toContain('Contas a pagar com avisos, repetição automática e boletos da nota de compra');
});
