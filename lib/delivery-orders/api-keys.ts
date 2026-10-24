import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { isSafeCallbackUrl } from './callback-url';

/** Gastrux order API keys (plan 2026-10-23 api-de-pedidos, Task 2). Only the sha256 of a key is stored. */
export class ApiKeyError extends Error {
  constructor(message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const KEY_PREFIX = 'gx_live_';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length)) {
      // 248 = 4 × 62: rejecting the rest keeps every character equally likely
      if (byte < 248 && out.length < length) out += BASE62[byte % 62];
    }
  }
  return out;
}

/** The restaurant's Gastrux order API integration, created on the first key */
async function apiIntegration(restaurantId: string) {
  const random = () => crypto.randomBytes(24).toString('hex');
  return prisma.deliveryIntegration.upsert({
    where: { restaurantId_platform: { restaurantId, platform: 'gastrux_api' } },
    create: { restaurantId, platform: 'gastrux_api', apiKey: random(), webhookSecret: random(), storeName: 'API do Gastrux', syncStatus: 'SUCCESS' },
    update: {},
    select: { id: true },
  });
}

export async function createApiKey(member: RestaurantMember, name: unknown): Promise<{ id: string; key: string; prefix: string }> {
  const label = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  if (!label) throw new ApiKeyError('Dê um nome à chave, como "Site da loja"');
  if (!isTierFeatureEnabled(await restaurantTier(member.restaurantId), 'orderApi')) {
    throw new ApiKeyError('A API de pedidos é dos planos Pro e Business', 403, { upgradeUrl: '/pricing' });
  }
  const integration = await apiIntegration(member.restaurantId);
  const key = KEY_PREFIX + randomBase62(32);
  const row = await prisma.orderApiKey.create({
    data: {
      restaurantId: member.restaurantId, integrationId: integration.id, name: label, prefix: key.slice(0, 12), keyHash: hashKey(key),
      callbackSecret: crypto.randomBytes(32).toString('hex'), createdById: member.userId,
    },
    select: { id: true, prefix: true },
  });
  await recordAudit(member, { action: 'CREATE', entityType: 'OrderApiKey', entityId: row.id, changes: { name: label, prefix: row.prefix } });
  return { id: row.id, key, prefix: row.prefix };
}

export async function authenticateOrderApiKey(authorization: string | null): Promise<{ restaurantId: string; integrationId: string; apiKeyId: string } | null> {
  const match = authorization?.match(/^Bearer (gx_live_[A-Za-z0-9]{32})$/);
  if (!match) return null;
  const row = await prisma.orderApiKey.findUnique({ where: { keyHash: hashKey(match[1]) }, select: { id: true, restaurantId: true, integrationId: true, revokedAt: true } });
  if (!row || row.revokedAt) return null;
  await prisma.orderApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { restaurantId: row.restaurantId, integrationId: row.integrationId, apiKeyId: row.id };
}

export async function listApiKeys(member: RestaurantMember) {
  const keys = await prisma.orderApiKey.findMany({
    where: { restaurantId: member.restaurantId, revokedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, callbackUrl: true, callbackSecret: true, createdById: true },
  });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: keys.map((k) => k.createdById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const available = isTierFeatureEnabled(await restaurantTier(member.restaurantId), 'orderApi');
  return { available, keys: keys.map(({ createdById, ...k }) => ({ ...k, createdBy: names.get(createdById) ?? null })) };
}

async function ownKey(member: RestaurantMember, id: string) {
  const row = await prisma.orderApiKey.findFirst({ where: { id, restaurantId: member.restaurantId, revokedAt: null }, select: { id: true, name: true } });
  if (!row) throw new ApiKeyError('Chave não encontrada', 404);
  return row;
}

export async function revokeApiKey(member: RestaurantMember, id: string) {
  const row = await ownKey(member, id);
  await prisma.orderApiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  await recordAudit(member, { action: 'DELETE', entityType: 'OrderApiKey', entityId: row.id, changes: { name: row.name, revoked: true } });
}

export async function setCallback(member: RestaurantMember, id: string, url: unknown) {
  const row = await ownKey(member, id);
  let callbackUrl: string | null = null;
  if (url !== null && url !== undefined && url !== '') {
    if (typeof url !== 'string' || url.length > 500 || !(await isSafeCallbackUrl(url.trim()))) {
      throw new ApiKeyError('Use um endereço https na internet (não vale localhost nem endereço da rede interna)');
    }
    callbackUrl = url.trim();
  }
  await prisma.orderApiKey.update({ where: { id: row.id }, data: { callbackUrl } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'OrderApiKey', entityId: row.id, changes: { callbackUrl } });
}
