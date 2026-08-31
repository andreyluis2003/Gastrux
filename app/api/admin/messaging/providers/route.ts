// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

function mask(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 6) return '••••••';
  return '••••••' + v.slice(-4);
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const configs = await prisma.messagingProviderConfig.findMany({
    where: { restaurantId },
  });

  const masked = configs.map((c: any) => ({
    ...c,
    apiKey: mask(c.apiKey),
    apiSecret: mask(c.apiSecret),
    webhookSecret: mask(c.webhookSecret),
  }));

  // Include WhatsApp (Meta) status to show the user connected sources
  const wa = await prisma.whatsAppConfig.findUnique({
    where: { restaurantId },
  });

  return NextResponse.json({ configs: masked, metaWhatsapp: wa });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const { provider, ...data } = body || {};
  if (!provider) return NextResponse.json({ error: 'Provider obrigatório' }, { status: 400 });

  // Do not overwrite masked secrets
  const cleaned: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && v.includes('•')) continue;
    cleaned[k] = v;
  }

  const existing = await prisma.messagingProviderConfig.findUnique({
    where: { restaurantId_provider: { restaurantId, provider } },
  });

  const saved = existing
    ? await prisma.messagingProviderConfig.update({
        where: { id: existing.id },
        data: cleaned,
      })
    : await prisma.messagingProviderConfig.create({
        data: { restaurantId, provider, ...cleaned },
      });

  return NextResponse.json({
    ok: true,
    config: {
      ...saved,
      apiKey: mask(saved.apiKey),
      apiSecret: mask(saved.apiSecret),
      webhookSecret: mask(saved.webhookSecret),
    },
  });
}
