// @ts-nocheck
// Referral Tier System
// Bronze: 0-5 referrals = R$50 per referral
// Silver: 6-10 referrals = R$75 per referral (+50%)
// Gold: 11+ referrals = R$100 per referral (+100%)

export interface ReferralTierInfo {
  tier: 'bronze' | 'silver' | 'gold';
  minReferrals: number;
  maxReferrals: number | null;
  bonusPerReferral: number; // in cents
  percentage: number; // bonus percentage vs bronze
  description: string;
}

const TIERS: ReferralTierInfo[] = [
  {
    tier: 'bronze',
    minReferrals: 0,
    maxReferrals: 5,
    bonusPerReferral: 5000, // R$50
    percentage: 0,
    description: 'Bronze - Iniciante',
  },
  {
    tier: 'silver',
    minReferrals: 6,
    maxReferrals: 10,
    bonusPerReferral: 7500, // R$75
    percentage: 50,
    description: 'Silver - Promotor',
  },
  {
    tier: 'gold',
    minReferrals: 11,
    maxReferrals: null,
    bonusPerReferral: 10000, // R$100
    percentage: 100,
    description: 'Gold - Embaixador',
  },
];

// Get tier based on referral count
export function getTierByReferralCount(referralCount: number): 'bronze' | 'silver' | 'gold' {
  if (referralCount >= 11) return 'gold';
  if (referralCount >= 6) return 'silver';
  return 'bronze';
}

// Get bonus amount based on tier
export function getBonusByTier(tier: string): number {
  const tierInfo = TIERS.find((t) => t.tier === tier);
  return tierInfo?.bonusPerReferral || 5000; // default to bronze if not found
}

// Get tier info
export function getTierInfo(tier: string): ReferralTierInfo | undefined {
  return TIERS.find((t) => t.tier === tier);
}

// Get all tiers
export function getAllTiers(): ReferralTierInfo[] {
  return TIERS;
}

// Get next tier info based on current referral count
export function getNextTierInfo(referralCount: number): ReferralTierInfo | null {
  const currentTier = getTierByReferralCount(referralCount);
  const nextTier = TIERS.find((t) => t.tier !== currentTier && t.minReferrals > referralCount);
  return nextTier || null;
}

// Get progress to next tier (percentage)
export function getProgressToNextTier(referralCount: number): { current: number; target: number; percentage: number } {
  const nextTier = getNextTierInfo(referralCount);
  if (!nextTier) {
    return { current: referralCount, target: referralCount + 1, percentage: 100 };
  }

  const currentTier = getTierByReferralCount(referralCount);
  const currentTierInfo = getTierInfo(currentTier);
  const minForNext = nextTier.minReferrals;

  const referralsInCurrentTier = referralCount - (currentTierInfo?.minReferrals || 0);
  const referralsNeededForNext = minForNext - (currentTierInfo?.minReferrals || 0);
  const percentage = Math.round((referralsInCurrentTier / referralsNeededForNext) * 100);

  return {
    current: referralCount,
    target: minForNext,
    percentage: Math.min(percentage, 100),
  };
}

// Format tier name with emoji
export function formatTierName(tier: string): string {
  switch (tier) {
    case 'bronze':
      return '🥉 Bronze';
    case 'silver':
      return '🥈 Silver';
    case 'gold':
      return '🏆 Gold';
    default:
      return tier;
  }
}

// Format bonus value
export function formatBonus(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}
