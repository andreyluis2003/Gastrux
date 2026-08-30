// @ts-nocheck
/**
 * Tier Guard - Paywall enforcement utility
 * Checks if a restaurant's subscription tier allows a given feature/limit
 */
import { prisma } from '@/lib/prisma';
import { getTierLimits } from '@/lib/stripe-config';

export interface TierCheckResult {
  allowed: boolean;
  currentTier: string;
  limit: number | null;
  current: number;
  upgradeRequired?: string;
}

const TIER_ORDER = ['starter', 'pro', 'business', 'enterprise'];

function nextTier(currentTier: string): string | null {
  const idx = TIER_ORDER.indexOf(currentTier);
  return idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

export async function checkTierLimit(
  restaurantId: string,
  resource: 'ingredients' | 'recipes' | 'users' | 'dailyTransactions' | 'deliveryIntegrations' | 'locations'
): Promise<TierCheckResult> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { subscriptionTier: true },
  });

  const tier = restaurant?.subscriptionTier || 'starter';
  const limits = getTierLimits(tier);
  const limit = (limits as any)[resource] ?? 999999;

  let current = 0;

  switch (resource) {
    case 'ingredients':
      current = await prisma.ingredient.count({ where: { restaurantId, active: true } });
      break;
    case 'recipes':
      current = await prisma.recipe.count({ where: { restaurantId, active: true } });
      break;
    case 'users':
      current = await prisma.restaurantUser.count({ where: { restaurantId, isActive: true } });
      break;
    case 'dailyTransactions': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      current = await prisma.order.count({
        where: { restaurantId, createdAt: { gte: today } },
      });
      break;
    }
    case 'deliveryIntegrations':
      current = await prisma.deliveryIntegration.count({ where: { restaurantId, isActive: true } });
      break;
    case 'locations':
      // Count restaurants owned by same owner
      const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ownerId: true } });
      current = rest?.ownerId
        ? await prisma.restaurant.count({ where: { ownerId: rest.ownerId, status: 'ACTIVE' } })
        : 1;
      break;
  }

  const allowed = current < limit;
  const upgrade = nextTier(tier);

  return {
    allowed,
    currentTier: tier,
    limit: limit >= 999999 ? null : limit,
    current,
    upgradeRequired: !allowed && upgrade ? upgrade : undefined,
  };
}

/**
 * Feature gating - check if a feature is available on the current tier
 */
export function isTierFeatureEnabled(
  tier: string,
  feature: 'kds' | 'qrMenu' | 'crm' | 'loyalty' | 'nfe' | 'customApi' | 'multiLocation' | 'advancedReports' | 'voiceAgent' | 'demandForecast'
): boolean {
  const featureMap: Record<string, string[]> = {
    kds: ['business', 'enterprise'],
    qrMenu: ['business', 'enterprise'],
    crm: ['business', 'enterprise'],
    loyalty: ['business', 'enterprise'],
    nfe: ['enterprise'],
    customApi: ['enterprise'],
    multiLocation: ['business', 'enterprise'],
    advancedReports: ['business', 'enterprise'],
    voiceAgent: ['pro', 'business', 'enterprise'],
    demandForecast: ['pro', 'business', 'enterprise'],
  };

  return (featureMap[feature] || []).includes(tier.toLowerCase());
}
