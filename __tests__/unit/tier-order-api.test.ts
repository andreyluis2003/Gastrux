import { isTierFeatureEnabled } from '@/lib/tier-guard';

// Delivery platforms design (owner decision 2026-10-23): the Gastrux order API on Pro and Business; Keeta, 99Food and
// iFood on Business only
it('orderApi is on Pro and up, deliveryPlatforms on Business and up', () => {
  expect(['starter', 'pro', 'business', 'enterprise'].map((t) => isTierFeatureEnabled(t, 'orderApi'))).toEqual([false, true, true, true]);
  expect(['starter', 'pro', 'business', 'enterprise'].map((t) => isTierFeatureEnabled(t, 'deliveryPlatforms'))).toEqual([false, false, true, true]);
});
