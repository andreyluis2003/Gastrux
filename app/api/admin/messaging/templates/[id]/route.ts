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

  const tpl = await prisma.messageTemplate.findFirst({
    where: { id: params.id, restaurantId },
  });
  if (!tpl) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
  return NextResponse.json({ template: tpl });
}

export async function PATCH(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const allowed = [
    'displayName',
    'category',
    'language',
    'headerText',
    'bodyText',
    'footerText',
    'buttons',
    'variables',
    'status',
    'rejectionReason',
  ];
  const data: any = {};
  for (const k of allowed) if (k in body) data[k] = body[k];

  const existing = await prisma.messageTemplate.findFirst({
    where: { id: params.id, restaurantId },
  });
  if (!existing) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });

  const updated = await prisma.messageTemplate.update({
    where: { id: params.id },
      restaurantId,
  });
  return NextResponse.json({ ok: true, template: updated });
}

export async function DELETE(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const existing = await prisma.messageTemplate.findFirst({
    where: { id: params.id, restaurantId },
    include: { _count: { select: { campaigns: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
  if (existing._count.campaigns > 0) {
    return NextResponse.json({ error: 'Template está em uso em campanhas existentes' }, { status: 409 });
  }
  await prisma.messageTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
