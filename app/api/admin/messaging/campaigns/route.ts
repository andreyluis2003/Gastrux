// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { normalizePhone } from '@/lib/messaging/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const where: any = { restaurantId };
  if (status) where.status = status;

  const campaigns = await prisma.messageCampaign.findMany({
    where,
    include: {
      template: { select: { id: true, name: true, displayName: true, status: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const {
    name,
    description,
    templateId,
    provider,
    defaultVariables,
    recipients,
    scheduledAt,
    throttlePerMin,
  } = body || {};

  if (!name || !templateId || !provider) {
    return NextResponse.json({ error: 'name, templateId e provider são obrigatórios' }, { status: 400 });
  }

  const tpl = await prisma.messageTemplate.findFirst({
    where: { id: templateId, restaurantId },
  });
  if (!tpl) return NextResponse.json({ error: 'Template inválido' }, { status: 400 });

  const recipientsRaw: any[] = Array.isArray(recipients) ? recipients : [];
  const dedup = new Map<string, any>();
  for (const r of recipientsRaw) {
    const phone = normalizePhone(r?.phone || r?.phoneNumber || '');
    if (!phone || phone.length < 10) continue;
    if (!dedup.has(phone)) {
      dedup.set(phone, {
        phoneNumber: phone,
        name: r?.name || null,
        customerId: r?.customerId || null,
        variables: r?.variables || {},
      });
    }
  }

  const recipientsList = Array.from(dedup.values());

  const campaign = await prisma.messageCampaign.create({
    data: {
      name,
      description: description || null,
      templateId,
      provider,
      status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      defaultVariables: defaultVariables || {},
      throttlePerMin: throttlePerMin || null,
      totalRecipients: recipientsList.length,
      createdById: (auth.session.user as any)?.id || null,
      recipients: {
        createMany: { data: recipientsList, skipDuplicates: true },
      },
    },
    include: {
      template: { select: { id: true, name: true, displayName: true, status: true } },
      _count: { select: { recipients: true } },
    },
  });

  return NextResponse.json({ ok: true, campaign });
}
