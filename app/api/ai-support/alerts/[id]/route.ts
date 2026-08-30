// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'OWNER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { resolved } = await req.json();
  const alert = await prisma.aIQualityAlert.update({
    where: { id: params.id },
    data: { resolved: !!resolved, resolvedAt: resolved ? new Date() : null },
  });
  return NextResponse.json(alert);
}
