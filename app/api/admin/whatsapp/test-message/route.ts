// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MetaCloudClient, normalizePhone } from '@/lib/whatsapp/meta-client';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const { to, text } = body;
  if (!to || !text) return NextResponse.json({ error: 'Campos obrigatórios: to, text' }, { status: 400 });

  const config = await prisma.whatsAppConfig.findUnique({ where: {} });
  if (!config?.accessToken || !config?.phoneNumberId) {
    return NextResponse.json({ error: 'Credenciais não configuradas' }, { status: 400 });
  }

  const client = new MetaCloudClient({
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
  });

  try {
    const res = await client.sendText({ to: normalizePhone(to), text });
    return NextResponse.json({ ok: true, result: res });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Falha ao enviar', meta: (err as any)?.meta },
      { status: 502 },
    );
  }
}
