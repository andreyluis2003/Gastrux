/** Referral rules (plan 2026-10-24 indicacao, Task 2) */
import { brtYear, monthValueCents, newReferralCode, normalizeReferralCode, CONFIRM_DAYS, REFERRAL_TRIAL_BONUS_DAYS, YEARLY_CAP } from '../../lib/referrals/rules';

describe('referral rules', () => {
  it('normalizes a typed code', () => {
    expect(normalizeReferralCode(' abc23d ')).toBe('ABC23D');
    expect(normalizeReferralCode('ab c2 3d')).toBe('ABC23D');
  });

  it('refuses codes outside the alphabet or of the wrong size', () => {
    expect(normalizeReferralCode('ABC0OD')).toBeNull();
    expect(normalizeReferralCode('ABC1LD')).toBeNull();
    expect(normalizeReferralCode('ABC23')).toBeNull();
    expect(normalizeReferralCode('ABC23DE')).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
    expect(normalizeReferralCode(undefined)).toBeNull();
  });

  it('makes codes of 6 readable characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = newReferralCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      expect(normalizeReferralCode(code)).toBe(code);
    }
  });

  it('values one month of the plan', () => {
    expect(monthValueCents('pro')).toBe(14900);
    expect(monthValueCents('business')).toBe(19900);
    expect(monthValueCents('starter')).toBe(0);
    expect(monthValueCents('enterprise')).toBe(0);
  });

  it('counts the year in Brasília', () => {
    expect(brtYear(new Date('2027-01-01T02:00:00Z'))).toBe(2026);
    expect(brtYear(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
  });

  it('keeps the numbers of the spec', () => {
    expect([REFERRAL_TRIAL_BONUS_DAYS, CONFIRM_DAYS, YEARLY_CAP]).toEqual([15, 7, 12]);
  });
});
