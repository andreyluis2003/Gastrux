/** Extending a trial never makes the client lose days (spec 2026-10-18 §8) */
import { extendedTrialEnd } from '@/lib/admin/trial';

const NOW = new Date('2026-10-18T12:00:00Z');
const D = 86_400_000;

it('adds to the current end when it is in the future, else to now', () => {
  expect(extendedTrialEnd(new Date(NOW.getTime() + 5 * D), { days: 7 }, NOW).getTime()).toBe(NOW.getTime() + 12 * D);
  expect(extendedTrialEnd(new Date(NOW.getTime() - 5 * D), { days: 7 }, NOW).getTime()).toBe(NOW.getTime() + 7 * D);
  expect(extendedTrialEnd(null, { days: 15 }, NOW).getTime()).toBe(NOW.getTime() + 15 * D);
});

it('a chosen date runs to the end of that day in Brasília and must be after today', () => {
  expect(extendedTrialEnd(null, { until: new Date('2026-11-30T00:00:00-03:00') }, NOW).toISOString()).toBe('2026-12-01T02:59:59.999Z');
  expect(() => extendedTrialEnd(null, { until: new Date('2026-10-01T00:00:00-03:00') }, NOW)).toThrow('A data precisa ser depois de hoje');
});
