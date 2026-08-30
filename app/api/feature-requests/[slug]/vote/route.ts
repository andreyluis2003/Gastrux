// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Faca login para votar' }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const body = await req.json().catch(() => ({}));
  const comment = body?.comment?.slice(0, 500) || null;

  const fr = await prisma.featureRequest.findUnique({
    where: { slug: params.slug },
    select: { id: true, voteCount: true },
  });
  if (!fr) {
    return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });
  }

  // Toggle: se ja votou, remove. Se nao, adiciona.
  const existing = await prisma.featureVote.findUnique({
    where: {
      featureRequestId_userId: {
        featureRequestId: fr.id,
        userId,
      },
    },
  });

  let voted: boolean;
  if (existing) {
    await prisma.$transaction([
      prisma.featureVote.delete({ where: { id: existing.id } }),
      prisma.featureRequest.update({
        where: { id: fr.id },
        data: { voteCount: { decrement: 1 } },
      }),
    ]);
    voted = false;
  } else {
    await prisma.$transaction([
      prisma.featureVote.create({
        data: { featureRequestId: fr.id, userId, comment },
      }),
      prisma.featureRequest.update({
        where: { id: fr.id },
        data: { voteCount: { increment: 1 } },
      }),
    ]);
    voted = true;
  }

  const updated = await prisma.featureRequest.findUnique({
    where: { id: fr.id },
    select: { voteCount: true },
  });

  return NextResponse.json({ success: true, voted, voteCount: updated?.voteCount ?? 0 });
}
