// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });

  const owned = await prisma.aIInsight.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Insight nao encontrado' }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (typeof body.pinned === 'boolean') data.pinned = body.pinned;
  if (typeof body.dismissed === 'boolean') data.dismissed = body.dismissed;

  const updated = await prisma.aIInsight.update({ where: { id: params.id }, data });
  return NextResponse.json({ insight: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });

  const owned = await prisma.aIInsight.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Insight nao encontrado' }, { status: 404 });

  await prisma.aIInsight.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
