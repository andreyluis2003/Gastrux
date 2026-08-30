// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || !['OWNER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }
  const body = await req.json();
  const { status, internalNotes, featureRequestId, tags } = body || {};
  const data: any = {};
  if (status) data.status = status;
  if (internalNotes !== undefined) data.internalNotes = internalNotes;
  if (featureRequestId !== undefined) data.featureRequestId = featureRequestId;
  if (tags !== undefined) data.tags = tags ? JSON.stringify(tags) : null;

  const fb = await prisma.feedback.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ success: true, feedback: fb });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || role !== 'OWNER') {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }
  await prisma.feedback.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
