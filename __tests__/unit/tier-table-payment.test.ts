import { isTierFeatureEnabled } from '@/lib/tier-guard';

describe('pay at the table by plan (owner, 2026-10-12)', () => {
  it.each([['starter', false], ['pro', true], ['business', true], ['enterprise', true], ['PRO', true]])('%s -> %s', (tier, expected) => {
    expect(isTierFeatureEnabled(tier as string, 'tablePayment')).toBe(expected);
  });
});
