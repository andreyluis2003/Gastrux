// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

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

  await prisma.aIInsight.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
