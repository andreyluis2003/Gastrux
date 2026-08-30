// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkTierLimit, isTierFeatureEnabled } from '@/lib/tier-guard';
import { getTierLimits } from '@/lib/stripe-config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true },
  });

  const tier = restaurant?.subscriptionTier || 'starter';
  const limits = getTierLimits(tier);

  // Check resource param
  const resource = req.nextUrl.searchParams.get('resource');
  const feature = req.nextUrl.searchParams.get('feature');

  if (resource) {
    const result = await checkTierLimit(restaurantId, resource as any);
    return NextResponse.json(result);
  }

  if (feature) {
    return NextResponse.json({
      feature,
      enabled: isTierFeatureEnabled(tier, feature as any),
      currentTier: tier,
    });
  }

  // Return full tier info
  return NextResponse.json({
    tier,
    status: restaurant?.subscriptionStatus || 'inactive',
    trialEndsAt: restaurant?.trialEndsAt,
    limits,
    features: {
      kds: isTierFeatureEnabled(tier, 'kds'),
      qrMenu: isTierFeatureEnabled(tier, 'qrMenu'),
      crm: isTierFeatureEnabled(tier, 'crm'),
      loyalty: isTierFeatureEnabled(tier, 'loyalty'),
      nfe: isTierFeatureEnabled(tier, 'nfe'),
      multiLocation: isTierFeatureEnabled(tier, 'multiLocation'),
      advancedReports: isTierFeatureEnabled(tier, 'advancedReports'),
      voiceAgent: isTierFeatureEnabled(tier, 'voiceAgent'),
      demandForecast: isTierFeatureEnabled(tier, 'demandForecast'),
    },
  });
}
