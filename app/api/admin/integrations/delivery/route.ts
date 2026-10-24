// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { DeliveryPlatform } from '@prisma/client';

export const dynamic = 'force-dynamic';

const MANAGED_PLATFORMS = ['ifood', 'gastrux_api', 'delivery_site'];
/** Never the secrets or the tokens back (final review 2026-10-24 I4) */
const PUBLIC_FIELDS = {
  id: true, platform: true, isActive: true, storeId: true, storeName: true, storePhone: true, storeAddress: true,
  webhookActive: true, lastWebhookTest: true, syncStatus: true, createdAt: true,
} as const;

export const GET = safeHandler(async (req, context) => {
  if (context.role === 'COOK') {
    return ApiErrors.FORBIDDEN();
  }

  const integrations = await prisma.deliveryIntegration.findMany({
    where: { restaurantId: context.restaurantId },
    select: {
      id: true,
      platform: true,
      isActive: true,
      storeName: true,
      storePhone: true,
      lastSyncedAt: true,
      totalOrdersSynced: true,
      lastOrderAt: true,
      syncStatus: true,
      createdAt: true,
    },
  });

  return NextResponse.json(integrations);
});

export const POST = safeHandler(async (req, context) => {
  if (context.role !== 'OWNER') {
    return ApiErrors.FORBIDDEN();
  }

  const { platform, apiKey, webhookSecret, storeId, storeName, storePhone, storeAddress } = await req.json();

  // Connected by their own screens: here a store id typed by hand could take another restaurant's iFood orders
  // (final review 2026-10-24 I4)
  if (MANAGED_PLATFORMS.includes(platform)) {
    return ApiErrors.INVALID_REQUEST({ message: 'Esta plataforma é conectada pela sua própria tela em Configurações' });
  }

  if (!platform || !apiKey || !webhookSecret) {
    return ApiErrors.INVALID_REQUEST({
      message: 'platform, apiKey, and webhookSecret are required',
    });
  }

  const existingIntegration = await prisma.deliveryIntegration.findUnique({
    where: {
      restaurantId_platform: {
        restaurantId: context.restaurantId,
        platform: platform as DeliveryPlatform,
      },
    },
  });

  // Only a genuinely new platform connection counts against the plan's
  // deliveryIntegrations limit - reconnecting/editing an existing one must not.
  if (!existingIntegration) {
    const { enforceResourceLimit } = await import('@/lib/api/tier-middleware');
    const tierBlock = await enforceResourceLimit(context.restaurantId, 'deliveryIntegrations');
    if (tierBlock) return tierBlock;
  }

  if (existingIntegration) {
    const updated = await prisma.deliveryIntegration.update({
      where: {
        restaurantId_platform: {
          restaurantId: context.restaurantId,
          platform: platform as DeliveryPlatform,
        },
      },
      data: {
        apiKey,
        webhookSecret,
        storeId,
        storeName,
        storePhone,
        storeAddress,
        isActive: true,
        webhookActive: true,
        lastWebhookTest: new Date(),
      },
      select: PUBLIC_FIELDS,
    });
    return NextResponse.json(updated);
  }

  const integration = await prisma.deliveryIntegration.create({
    data: {
      restaurantId: context.restaurantId,
      platform: platform as DeliveryPlatform,
      apiKey,
      webhookSecret,
      storeId,
      storeName,
      storePhone,
      storeAddress,
      isActive: true,
      webhookActive: true,
      lastWebhookTest: new Date(),
      syncStatus: 'PENDING',
    },
    select: PUBLIC_FIELDS,
  });

  return NextResponse.json(integration);
});
