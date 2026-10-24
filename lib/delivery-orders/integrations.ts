import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const LABEL = { gastrux_api: 'API do Gastrux', delivery_site: 'Cardápio digital' } as const;

/**
 * The restaurant's own integration of the order pipeline (plan 2026-10-23 api-de-pedidos): the Gastrux order API or
 * the digital menu, created on first use. Its apiKey/webhookSecret columns are required by the table and unused here.
 */
export async function ownIntegration(restaurantId: string, platform: keyof typeof LABEL): Promise<{ id: string }> {
  const random = () => crypto.randomBytes(24).toString('hex');
  return prisma.deliveryIntegration.upsert({
    where: { restaurantId_platform: { restaurantId, platform } },
    create: { restaurantId, platform, apiKey: random(), webhookSecret: random(), storeName: LABEL[platform], syncStatus: 'SUCCESS' },
    update: {},
    select: { id: true },
  });
}
