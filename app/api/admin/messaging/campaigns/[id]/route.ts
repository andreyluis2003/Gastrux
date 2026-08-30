// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const campaign = await prisma.messageCampaign.findFirst({
    where: { id: params.id, restaurantId },
    include: {
      template: true,
      recipients: {
        orderBy: { createdAt: 'asc' },
        take: 1000,
      },
    },
  });
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });

  const statsByStatus = await prisma.messageCampaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId: params.id },
    _count: { _all: true },
  });
  const stats: Record<string, number> = {};
  statsByStatus.forEach((s: any) => {
    stats[s.status] = s._count._all;
  });

  return NextResponse.json({ campaign, stats });
}

export async function PATCH(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const allowed = ['name', 'description', 'status', 'scheduledAt', 'defaultVariables', 'throttlePerMin'];
  const data: any = {};
  for (const k of allowed) if (k in body) data[k] = body[k];
  if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);

  const existing = await prisma.messageCampaign.findFirst({
    where: { id: params.id, restaurantId },
  });
  if (!existing) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });

  const updated = await prisma.messageCampaign.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, campaign: updated });
}

export async function DELETE(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const existing = await prisma.messageCampaign.findFirst({
    where: { id: params.id, restaurantId },
  });
  if (!existing) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
  if (existing.status === 'RUNNING') {
    return NextResponse.json({ error: 'Não é possível remover campanha em execução' }, { status: 409 });
  }
  await prisma.messageCampaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
