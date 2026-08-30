// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// GET /api/feature-requests - roadmap publico
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const sort = searchParams.get('sort') || 'votes';

  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const isAdmin = session && ['OWNER', 'ADMIN'].includes(role);

  const where: any = {};
  if (!isAdmin) where.isPublic = true;
  if (status) where.status = status;
  if (category) where.category = category;

  const orderBy: any =
    sort === 'recent'
      ? { createdAt: 'desc' }
      : sort === 'status'
      ? [{ priority: 'desc' }, { voteCount: 'desc' }]
      : [{ voteCount: 'desc' }, { createdAt: 'desc' }];

  const userId = (session?.user as any)?.id || null;

  const items = await prisma.featureRequest.findMany({
    where,
    orderBy,
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true } },
      votes: userId
        ? { where: { userId }, select: { id: true } }
        : false,
      _count: { select: { votes: true, feedbacks: true } },
    },
  });

  const stats = await prisma.featureRequest.groupBy({
    by: ['status'],
    _count: { status: true },
    where: isAdmin ? undefined : { isPublic: true },
  });

  return NextResponse.json({
    items: items.map((it: any) => ({
      ...it,
      userVoted: Array.isArray(it.votes) ? it.votes.length > 0 : false,
      votes: undefined,
    })),
    stats,
  });
}

// POST /api/feature-requests - criar novo request
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Faca login para sugerir' }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isAdmin = ['OWNER', 'ADMIN'].includes(role);

  const body = await req.json();
  const { title, description, category, status, priority } = body || {};
  if (!title || !description) {
    return NextResponse.json(
      { error: 'Titulo e descricao obrigatorios' },
      { status: 400 }
    );
  }
  if (title.length > 200 || description.length > 3000) {
    return NextResponse.json({ error: 'Textos muito longos' }, { status: 400 });
  }

  // slug unico
  const baseSlug = slugify(title) || `req-${Date.now()}`;
  let slug = baseSlug;
  let i = 1;
  while (await prisma.featureRequest.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const fr = await prisma.featureRequest.create({
    data: {
      title,
      slug,
      description,
      category: category || null,
      createdById: userId,
      status: isAdmin && status ? status : 'OPEN',
      priority: isAdmin && priority ? priority : 'NORMAL',
      voteCount: 1,
      votes: {
        create: { userId },
      },
    },
  });

  return NextResponse.json({ success: true, featureRequest: fr });
}
