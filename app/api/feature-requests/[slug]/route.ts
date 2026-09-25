// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id || null;

  const fr = await prisma.featureRequest.findUnique({
    where: { slug: params.slug },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { votes: true, feedbacks: true } },
    },
  });
  if (!fr) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

  let userVoted = false;
  if (userId) {
    const v = await prisma.featureVote.findUnique({
      where: {
        featureRequestId_userId: {
          featureRequestId: fr.id,
          userId,
        },
      },
    });
    userVoted = !!v;
  }

  return NextResponse.json({ featureRequest: fr, userVoted });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }
  const body = await req.json();
  const {
    title,
    description,
    category,
    status,
    priority,
    estimatedEffort,
    targetRelease,
    plannedFor,
    releasedAt,
    isPublic,
  } = body || {};

  const data: any = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (category !== undefined) data.category = category;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (estimatedEffort !== undefined) data.estimatedEffort = estimatedEffort;
  if (targetRelease !== undefined) data.targetRelease = targetRelease;
  if (plannedFor !== undefined) data.plannedFor = plannedFor ? new Date(plannedFor) : null;
  if (releasedAt !== undefined) data.releasedAt = releasedAt ? new Date(releasedAt) : null;
  if (isPublic !== undefined) data.isPublic = isPublic;

  const fr = await prisma.featureRequest.update({
    where: { slug: params.slug },
    data,
  });
  return NextResponse.json({ success: true, featureRequest: fr });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }
  await prisma.featureRequest.delete({ where: { slug: params.slug } });
  return NextResponse.json({ success: true });
}
