// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { DeliveryPlatform } from '@prisma/client';

export const dynamic = 'force-dynamic';

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
  });

  return NextResponse.json(integration);
});
