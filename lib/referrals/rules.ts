import crypto from 'crypto';
import { getBaseTierById } from '@/lib/billing/pricing-tiers';
import { REFERRAL_ALPHABET, REFERRAL_CODE_SIZE } from './code';

/**
 * Referral program rules (spec docs/superpowers/specs/2026-10-23-indicacao-design.md, plan 2026-10-24 indicacao).
 * Pure: no database.
 */
export { normalizeReferralCode } from './code';

export const REFERRAL_TRIAL_BONUS_DAYS = 15;
/** The referred restaurant must keep paying this long after its first charge before the month is earned */
export const CONFIRM_DAYS = 7;
/** Free months a referring restaurant earns per calendar year (Brasília) */
export const YEARLY_CAP = 12;

export function newReferralCode(random: (max: number) => number = crypto.randomInt): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_SIZE; i++) code += REFERRAL_ALPHABET[random(REFERRAL_ALPHABET.length)];
  return code;
}

/** One month of the plan, in cents; 0 for a plan without a list price (Enterprise is a contract) */
export function monthValueCents(tier: string): number {
  const price = getBaseTierById(tier)?.priceMonthly;
  return typeof price === 'number' ? Math.round(price * 100) : 0;
}

export function brtYear(d: Date): number {
  return Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }));
}
