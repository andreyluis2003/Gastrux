import { isTierFeatureEnabled } from '@/lib/tier-guard';

// Business and up since the plans of 2026-10-18 (was Pro and up, owner 2026-10-12)
describe('pay at the table by plan', () => {
  it.each([['starter', false], ['pro', false], ['business', true], ['enterprise', true], ['BUSINESS', true]])('%s -> %s', (tier, expected) => {
    expect(isTierFeatureEnabled(tier as string, 'tablePayment')).toBe(expected);
  });
});
