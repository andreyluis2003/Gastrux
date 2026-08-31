// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, (session.user as any)?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const lead = await prisma.marketingLead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, (session.user as any)?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
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
      data,
    });

    return NextResponse.json({ lead });
  } catch (err: any) {
    console.error('[admin-leads] update error:', err?.message || err);
    return NextResponse.json({ error: 'Erro ao atualizar lead' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, (session.user as any)?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await prisma.marketingLead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
