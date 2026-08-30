// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

  const lead = await prisma.marketingLead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  try {
    const body = await req.json();
    const allowedFields = [
      'status', 'stage', 'score', 'notes', 'tags',
      'name', 'email', 'phoneNumber', 'businessName', 'segment',
      'lastContactAt', 'nextFollowUpAt', 'contactAttempts',
    ];

    const data: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'lastContactAt' || field === 'nextFollowUpAt') {
          data[field] = body[field] ? new Date(body[field]) : null;
        } else {
          data[field] = body[field];
        }
      }
    }

    // Se marcou como CONVERTED, registra data
    if (body.status === 'CONVERTED' && !body.convertedAt) {
      data.convertedAt = new Date();
      data.stage = 'CONVERTED';
    }

    const lead = await prisma.marketingLead.update({
      where: { id: params.id },
        restaurantId,
    });

    return NextResponse.json({ lead });
  } catch (err: any) {
    console.error('[admin-leads] update error:', err?.message || err);
    return NextResponse.json({ error: 'Erro ao atualizar lead' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

  const role = (session.user as any)?.role;
  if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  await prisma.marketingLead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
