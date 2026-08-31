// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: params.id, restaurantId },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
      orderSession: { include: { items: { include: { recipe: true } } } },
    },
  });
  if (!conv) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });
  return NextResponse.json({ conversation: conv });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: params.id, restaurantId },
    select: { id: true },
  });
  if (!conv) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.state) data.state = body.state;
  if (body.customerNotes !== undefined) data.customerNotes = body.customerNotes || null;

  const updated = await prisma.whatsAppConversation.update({
    where: { id: conv.id },
    data,
  });
  return NextResponse.json({ conversation: updated });
}
