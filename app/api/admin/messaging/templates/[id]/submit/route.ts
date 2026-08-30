// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { getProviderClient } from '@/lib/messaging/provider-factory';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const provider = (body?.provider || 'META_CLOUD').toUpperCase();

  const tpl = await prisma.messageTemplate.findFirst({
    where: { id: params.id, restaurantId },
  });
  if (!tpl) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });

  const { client, error } = await getProviderClient(restaurantId, provider);
  if (!client) return NextResponse.json({ error: error || 'Provider não disponível' }, { status: 400 });

  const result = await client.submitTemplate({
    name: tpl.name,
    language: tpl.language,
    category: tpl.category,
    headerText: tpl.headerText,
    bodyText: tpl.bodyText,
    footerText: tpl.footerText,
    buttons: (tpl.buttons as any) || null,
    variables: (tpl.variables as any) || [],
  });

  if (!result.ok) {
    await prisma.messageTemplate.update({
      where: { id: tpl.id },
      data: { status: 'REJECTED', rejectionReason: result.error || 'Erro desconhecido' },
    });
    return NextResponse.json({ error: result.error || 'Falha ao submeter' }, { status: 500 });
  }

  // Attach providerRef to matching field
  const providerRefField =
    provider === 'META_CLOUD'
      ? 'metaTemplateId'
      : provider === 'TAKE_BLIP'
      ? 'blipTemplateId'
      : 'zenviaTemplateId';

  const updated = await prisma.messageTemplate.update({
    where: { id: tpl.id },
    data: {
      status: 'PENDING_APPROVAL',
      rejectionReason: null,
      [providerRefField]: result.providerRef,
    },
  });
  return NextResponse.json({ ok: true, template: updated, raw: result.raw });
}
