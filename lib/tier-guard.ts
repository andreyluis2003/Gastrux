// @ts-nocheck
/**
 * Tier Guard - Paywall enforcement utility
 * Checks if a restaurant's subscription tier allows a given feature/limit
 */
import { prisma } from '@/lib/prisma';
import { OWN_RECIPE_WHERE } from '@/lib/cardapio/product-recipe';
import { getTierLimits } from '@/lib/stripe-config';

export interface TierCheckResult {
  allowed: boolean;
  currentTier: string;
  limit: number | null;
  current: number;
  upgradeRequired?: string;
}

const TIER_ORDER = ['starter', 'pro', 'business', 'enterprise'];

/**
 * The plan that decides features and limits. 'starter' means "no plan" since 2026-10-18 (the Starter plan no
 * longer exists). An internal account works as Business at least (owner, 2026-10-19; review M-4: internal 'pro'
 * accounts lost pay at the table). To test Pro, turn off 'Conta interna' on that account.
 */
export function effectiveTier(r: { subscriptionTier?: string | null; isInternal?: boolean | null } | null | undefined): string {
  const tier = r?.subscriptionTier || 'starter';
  return r?.isInternal && TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf('business') ? 'business' : tier;
}

export async function restaurantTier(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true, isInternal: true } });
  return effectiveTier(r);
}

function nextTier(currentTier: string): string | null {
  const idx = TIER_ORDER.indexOf(currentTier);
  return idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

export async function checkTierLimit(
  restaurantId: string,
  resource: 'ingredients' | 'recipes' | 'users' | 'deliveryIntegrations' | 'locations' | 'kitchenStations'
): Promise<TierCheckResult> {
  const tier = await restaurantTier(restaurantId);
  const limits = getTierLimits(tier);
  const limit = (limits as any)[resource] ?? 999999;

  let current = 0;

  switch (resource) {
    case 'ingredients':
      current = await prisma.ingredient.count({ where: { restaurantId, active: true } });
      break;
    case 'recipes':
      // Fichas simples (items sold as bought) are not the restaurant's fichas técnicas
      current = await prisma.recipe.count({ where: { restaurantId, active: true, ...OWN_RECIPE_WHERE } });
      break;
    case 'users':
      current = await prisma.restaurantUser.count({ where: { restaurantId, isActive: true } });
      break;
    case 'kitchenStations':
      current = await prisma.kitchenStation.count({ where: { restaurantId, active: true } });
      break;
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
  feature: 'kds' | 'qrMenu' | 'tablePayment' | 'crm' | 'crmNotes' | 'crmCampaigns' | 'labelExpiry' | 'dailyCountAlert' | 'utilityInsights' | 'loyalty' | 'payableSeries' | 'payableAlerts' | 'payableFromNfe' | 'nfe' | 'customApi' | 'multiLocation' | 'advancedReports' | 'voiceAgent' | 'demandForecast'
): boolean {
  const featureMap: Record<string, string[]> = {
    // Owner decision 2026-10-09: the KDS, the QR menu and the basic CRM (customer list and history) on
    // every plan; the paid plans keep more stations (limits.kitchenStations), notes and campaigns
    kds: ['starter', 'pro', 'business', 'enterprise'],
    qrMenu: ['starter', 'pro', 'business', 'enterprise'],
    // Owner decision 2026-10-12: pay at the table by phone (bill, split, PIX). Plans of 2026-10-18: what earns or
    // saves money (pay at the table, expiry control, utility indicators, daily-count alert) is Business and up
    tablePayment: ['business', 'enterprise'],
    crm: ['starter', 'pro', 'business', 'enterprise'],
    crmNotes: ['pro', 'business', 'enterprise'],
    crmCampaigns: ['business', 'enterprise'],
    // Owner decision 2026-10-09: label printing on every plan; the expiry control Business and up (2026-10-18)
    labelExpiry: ['business', 'enterprise'],
    // Owner decision 2026-10-16: the daily count (espetos) on every plan; the bell alert on a difference Business and up (2026-10-18)
    dailyCountAlert: ['business', 'enterprise'],
    // Owner decision 2026-10-16: utility bills and their DRE line on every plan; indicators and alert Business and up (2026-10-18)
    utilityInsights: ['business', 'enterprise'],
    loyalty: ['business', 'enterprise'],
    // Spec 2026-10-18 contas a pagar: the list, installments and paying on every plan; what saves work is Business
    payableSeries: ['business', 'enterprise'],
    payableAlerts: ['business', 'enterprise'],
    payableFromNfe: ['business', 'enterprise'],
    // Owner decision 2026-10-09: the NFC-e on every plan (a restaurant must issue the consumer note)
    nfe: ['starter', 'pro', 'business', 'enterprise'],
    customApi: ['enterprise'],
    multiLocation: ['business', 'enterprise'],
    advancedReports: ['business', 'enterprise'],
    voiceAgent: ['pro', 'business', 'enterprise'],
    demandForecast: ['pro', 'business', 'enterprise'],
  };

  return (featureMap[feature] || []).includes(tier.toLowerCase());
}
