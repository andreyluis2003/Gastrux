import { isValidYmd } from '@/lib/dates';

describe('isValidYmd', () => {
  it('takes real calendar days only', () => {
    expect(isValidYmd('2026-02-28')).toBe(true);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2026-02-31')).toBe(false);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-00-10')).toBe(false);
    expect(isValidYmd('2026-04-31')).toBe(false);
  });

  it('refuses other shapes and types', () => {
    expect(isValidYmd('31/08/2026')).toBe(false);
    expect(isValidYmd('2026-8-1')).toBe(false);
    expect(isValidYmd('2026-08-01T00:00')).toBe(false);
    expect(isValidYmd(20260801)).toBe(false);
    expect(isValidYmd(null)).toBe(false);
  });
});
