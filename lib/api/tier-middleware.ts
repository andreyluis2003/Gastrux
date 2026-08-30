// @ts-nocheck
/**
 * Tier enforcement middleware for API routes
 * Usage: wrap your handler to enforce resource limits before execution
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkTierLimit, isTierFeatureEnabled, TierCheckResult } from '@/lib/tier-guard';

type ResourceType = 'ingredients' | 'recipes' | 'users' | 'dailyTransactions' | 'deliveryIntegrations' | 'locations';
type FeatureType = 'kds' | 'qrMenu' | 'crm' | 'loyalty' | 'nfe' | 'customApi' | 'multiLocation' | 'advancedReports' | 'voiceAgent' | 'demandForecast';

/**
 * Checks resource limits before allowing a CREATE operation
 * Returns null if allowed, or a NextResponse with 403 if not
 */
export async function enforceResourceLimit(
  restaurantId: string,
  resource: ResourceType
): Promise<NextResponse | null> {
  const result = await checkTierLimit(restaurantId, resource);
  if (!result.allowed) {
    const resourceNames: Record<string, string> = {
      ingredients: 'ingredientes',
      recipes: 'receitas',
      users: 'usu\u00e1rios',
      dailyTransactions: 'transa\u00e7\u00f5es di\u00e1rias',
      deliveryIntegrations: 'integra\u00e7\u00f5es delivery',
      locations: 'unidades',
    };
    return NextResponse.json({
      error: `Limite de ${resourceNames[resource] || resource} atingido (${result.current}/${result.limit}).`,
      tierRequired: result.upgradeRequired,
      currentTier: result.currentTier,
      upgradeUrl: '/pricing',
    }, { status: 403 });
  }
  return null;
}

/**
 * Checks if a feature is enabled for the restaurant's tier
 * Returns null if allowed, or a NextResponse with 403 if not
 */
export async function enforceFeature(
  restaurantId: string,
  feature: FeatureType
): Promise<NextResponse | null> {
  const { prisma } = await import('@/lib/prisma');
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { subscriptionTier: true },
  });
  const tier = restaurant?.subscriptionTier || 'starter';

  if (!isTierFeatureEnabled(tier, feature)) {
    const featureNames: Record<string, string> = {
      kds: 'Kitchen Display System',
      qrMenu: 'Card\u00e1pio Digital QR',
      crm: 'CRM',
      loyalty: 'Programa de Fidelidade',
      nfe: 'Nota Fiscal Eletr\u00f4nica',
      customApi: 'API Customizada',
      multiLocation: 'Multi-Loja',
      advancedReports: 'Relat\u00f3rios Avan\u00e7ados',
      voiceAgent: 'Agente de Voz',
      demandForecast: 'Previs\u00e3o de Demanda',
    };
    return NextResponse.json({
      error: `A funcionalidade "${featureNames[feature] || feature}" n\u00e3o est\u00e1 dispon\u00edvel no plano ${tier}. Fa\u00e7a upgrade para ter acesso.`,
      currentTier: tier,
      upgradeUrl: '/pricing',
    }, { status: 403 });
  }
  return null;
}
