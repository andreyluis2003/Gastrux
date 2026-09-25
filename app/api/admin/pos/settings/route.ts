import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRestaurantMember, MANAGER_ROLES, recordAudit } from '@/lib/auth/restaurant-role';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * A manager of the restaurant being worked in. This used to read session.user.currentRestaurantId,
 * a field the session never carries, so every call answered 401 and the PDV screens never loaded.
 */
async function getContext() {
  const member = await getRestaurantMember();
  if (!member || !MANAGER_ROLES.includes(member.role)) return null;
  return { member, restaurantId: member.restaurantId };
}

function maskSecret(val: string | null | undefined): string | null {
  if (!val) return null;
  return '••••••' + val.slice(-4);
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const settings = await prisma.pOSSettings.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: 'desc' },
  });

  const masked = settings.map((s: any) => ({
    ...s,
    squareAccessToken: maskSecret(s.squareAccessToken),
    sumupApiKey: maskSecret(s.sumupApiKey),
    stoneApiKey: maskSecret(s.stoneApiKey),
    saiposApiKey: maskSecret(s.saiposApiKey),
    totvsApiKey: maskSecret(s.totvsApiKey),
  }));

  return NextResponse.json({ settings: masked });
}

export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const provider = body.provider || 'STONE';
  const validProviders = ['SQUARE', 'SUMUP', 'STONE', 'SAIPOS', 'TOTVS', 'GENERIC'];
  if (!validProviders.includes(provider)) {
    return NextResponse.json({ error: 'Provider inválido' }, { status: 400 });
  }

  const existing = await prisma.pOSSettings.findUnique({
    where: { restaurantId_provider: { restaurantId: ctx.restaurantId, provider } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Já existe configuração para esse provider' }, { status: 409 });
  }

  const webhookSecret = randomBytes(32).toString('hex');

  const data: any = {
    restaurantId: ctx.restaurantId,
    provider,
    webhookSecret,
    isConfigured: false,
    syncEnabled: body.syncEnabled !== false,
    autoReconcile: body.autoReconcile !== false,
    deviceSerial: body.deviceSerial || null,
  };

  // Provider-specific fields
  if (provider === 'STONE') {
    data.stoneApiKey = body.stoneApiKey || null;
    data.stoneStoneCode = body.stoneStoneCode || null;
    data.stoneMerchantId = body.stoneMerchantId || null;
    data.isConfigured = Boolean(body.stoneApiKey);
  } else if (provider === 'SAIPOS') {
    data.saiposApiKey = body.saiposApiKey || null;
    data.saiposStoreId = body.saiposStoreId || null;
    data.isConfigured = Boolean(body.saiposApiKey);
  } else if (provider === 'TOTVS') {
    data.totvsApiKey = body.totvsApiKey || null;
    data.totvsTenantId = body.totvsTenantId || null;
    data.totvsUnitId = body.totvsUnitId || null;
    data.isConfigured = Boolean(body.totvsApiKey);
  } else if (provider === 'SQUARE') {
    data.squareAccessToken = body.squareAccessToken || null;
    data.squareLocationId = body.squareLocationId || null;
    data.squareMerchantId = body.squareMerchantId || null;
    data.isConfigured = Boolean(body.squareAccessToken);
  } else if (provider === 'GENERIC') {
    data.isConfigured = true;
  }

  const settings = await prisma.pOSSettings.create({ data });
  await recordAudit(ctx.member, {
    action: 'CREATE', entityType: 'POSSettings', entityId: settings.id,
    changes: { provider, syncEnabled: data.syncEnabled, autoReconcile: data.autoReconcile },
  });

  return NextResponse.json({
    settings: {
      ...settings,
      stoneApiKey: maskSecret(settings.stoneApiKey),
      saiposApiKey: maskSecret(settings.saiposApiKey),
      totvsApiKey: maskSecret(settings.totvsApiKey),
      squareAccessToken: maskSecret(settings.squareAccessToken),
      sumupApiKey: maskSecret(settings.sumupApiKey),
    },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.pOSSettings.findFirst({
    where: { id, restaurantId: ctx.restaurantId },
  });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const data: any = {};
  if (updates.syncEnabled !== undefined) data.syncEnabled = updates.syncEnabled;
  if (updates.autoReconcile !== undefined) data.autoReconcile = updates.autoReconcile;
  if (updates.deviceSerial !== undefined) data.deviceSerial = updates.deviceSerial || null;

  // Stone
  if (updates.stoneApiKey && !/••••••/.test(updates.stoneApiKey)) data.stoneApiKey = updates.stoneApiKey;
  if (updates.stoneStoneCode !== undefined) data.stoneStoneCode = updates.stoneStoneCode || null;
  if (updates.stoneMerchantId !== undefined) data.stoneMerchantId = updates.stoneMerchantId || null;

  // Saipos
  if (updates.saiposApiKey && !/••••••/.test(updates.saiposApiKey)) data.saiposApiKey = updates.saiposApiKey;
  if (updates.saiposStoreId !== undefined) data.saiposStoreId = updates.saiposStoreId || null;

  // TOTVS
  if (updates.totvsApiKey && !/••••••/.test(updates.totvsApiKey)) data.totvsApiKey = updates.totvsApiKey;
  if (updates.totvsTenantId !== undefined) data.totvsTenantId = updates.totvsTenantId || null;
  if (updates.totvsUnitId !== undefined) data.totvsUnitId = updates.totvsUnitId || null;

  // Recalculate isConfigured
  const merged = { ...existing, ...data };
  data.isConfigured = Boolean(
    (merged.provider === 'STONE' && merged.stoneApiKey) ||
    (merged.provider === 'SAIPOS' && merged.saiposApiKey) ||
    (merged.provider === 'TOTVS' && merged.totvsApiKey) ||
    (merged.provider === 'SQUARE' && merged.squareAccessToken) ||
    (merged.provider === 'SUMUP' && merged.sumupApiKey) ||
    (merged.provider === 'GENERIC')
  );

  const updated = await prisma.pOSSettings.update({ where: { id }, data });
  // Keys are recorded as "changed", never their values
  await recordAudit(ctx.member, {
    action: 'UPDATE', entityType: 'POSSettings', entityId: id,
    changes: Object.fromEntries(Object.keys(data).map((k) => [k, /ApiKey|AccessToken/.test(k) ? 'alterada' : data[k]])),
  });

  return NextResponse.json({
    settings: {
      ...updated,
      stoneApiKey: maskSecret(updated.stoneApiKey),
      saiposApiKey: maskSecret(updated.saiposApiKey),
      totvsApiKey: maskSecret(updated.totvsApiKey),
      squareAccessToken: maskSecret(updated.squareAccessToken),
      sumupApiKey: maskSecret(updated.sumupApiKey),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.pOSSettings.findFirst({
    where: { id, restaurantId: ctx.restaurantId },
  });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.pOSSettings.delete({ where: { id } });
  await recordAudit(ctx.member, { action: 'DELETE', entityType: 'POSSettings', entityId: id, changes: { provider: existing.provider } });
  return NextResponse.json({ success: true });
}
