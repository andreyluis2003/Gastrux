// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { TakeBlipClient } from './take-blip-client';
import { ZenviaClient } from './zenvia-client';
import { MetaTemplateClient } from './meta-template-client';
import type { MessagingProviderClient, ProviderName } from './types';

/**
 * Seleciona e constrói o cliente de mensageria para o restaurante.
 */
export async function getProviderClient(
  restaurantId: string,
  provider: ProviderName
): Promise<{ client: MessagingProviderClient | null; error?: string }> {
  const cfg = await prisma.messagingProviderConfig.findUnique({
    where: { restaurantId_provider: { restaurantId, provider } },
  });

  if (provider === 'META_CLOUD') {
    // Delegamos para WhatsAppConfig (Phase 51) — cfg aqui é opcional
    const client = new MetaTemplateClient(
      {
        apiKey: cfg?.apiKey || null,
        botIdentifier: cfg?.botIdentifier || null,
      },
      restaurantId
    );
    return { client };
  }

  if (!cfg) return { client: null, error: `Provider ${provider} não configurado` };
  if (!cfg.isActive) return { client: null, error: `Provider ${provider} está inativo` };

  if (provider === 'TAKE_BLIP') {
    return {
      client: new TakeBlipClient({
        apiKey: cfg.apiKey,
        botIdentifier: cfg.botIdentifier,
        blipRouter: cfg.blipRouter || 'https://msging.net',
      }),
    };
  }
  if (provider === 'ZENVIA') {
    return {
      client: new ZenviaClient({
        apiKey: cfg.apiKey,
        fromNumber: cfg.fromNumber,
        zenviaAccount: cfg.zenviaAccount,
      }),
    };
  }

  return { client: null, error: `Provider ${provider} não suportado` };
}
