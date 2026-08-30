// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/feedback - cria novo feedback (publico ou autenticado)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const {
      type = 'GENERAL',
      score,
      comment,
      page,
      feature,
      email,
      tags,
    } = body || {};

    const allowedTypes = ['NPS', 'CSAT', 'CES', 'GENERAL', 'BUG', 'IDEA'];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
    if (type === 'NPS' && (score == null || score < 0 || score > 10)) {
      return NextResponse.json({ error: 'NPS deve ser 0-10' }, { status: 400 });
    }
    if (type === 'CSAT' && (score == null || score < 1 || score > 5)) {
      return NextResponse.json({ error: 'CSAT deve ser 1-5' }, { status: 400 });
    }
    if (type === 'CES' && (score == null || score < 1 || score > 7)) {
      return NextResponse.json({ error: 'CES deve ser 1-7' }, { status: 400 });
    }
    if (!comment && !score) {
      return NextResponse.json(
        { error: 'Envie uma avaliacao ou um comentario' },
        { status: 400 }
      );
    }

    const userId = (session?.user as any)?.id || null;
    let restaurantId: string | null = null;
    if (userId) {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
      });
      restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId || null;
    }

    const fb = await prisma.feedback.create({
      data: {
        type,
        score: score != null ? Number(score) : null,
        comment: comment || null,
        page: page || null,
        feature: feature || null,
        email: email || (session?.user as any)?.email || null,
        tags: tags ? JSON.stringify(tags) : null,
        userId,
        restaurantId,
      },
    });

    return NextResponse.json({ success: true, feedback: { id: fb.id, type: fb.type } });
  } catch (err: any) {
    console.error('[feedback/POST]', err);
    return NextResponse.json({ error: 'Erro ao enviar feedback' }, { status: 500 });
  }
}

// GET /api/feedback - lista (apenas admin)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || !['OWNER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const status = searchParams.get('status');
  const take = Math.min(Number(searchParams.get('take') || 100), 500);

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const [items, total, byType, byStatus, npsRows, csatAggr, cesAggr] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, name: true, email: true } },
        restaurant: { select: { id: true, name: true } },
      },
    }),
    prisma.feedback.count({ where }),
    prisma.feedback.groupBy({
      by: ['type'],
      _count: { type: true },
    }),
    prisma.feedback.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
    prisma.feedback.findMany({
      where: { type: 'NPS', score: { not: null } },
      select: { score: true },
    }),
    prisma.feedback.aggregate({
      where: { type: 'CSAT', score: { not: null } },
      _avg: { score: true },
      _count: { score: true },
    }),
    prisma.feedback.aggregate({
      where: { type: 'CES', score: { not: null } },
      _avg: { score: true },
      _count: { score: true },
    }),
  ]);

  const byTypeMap: Record<string, number> = {};
  byType.forEach((row: any) => {
    byTypeMap[row.type] = row._count?.type || 0;
  });
  const byStatusMap: Record<string, number> = {};
  byStatus.forEach((row: any) => {
    byStatusMap[row.status] = row._count?.status || 0;
  });

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  let npsSum = 0;
  npsRows.forEach((r: any) => {
    const s = Number(r.score);
    npsSum += s;
    if (s >= 9) promoters++;
    else if (s >= 7) passives++;
    else detractors++;
  });
  const npsTotal = npsRows.length;
  const npsAvg = npsTotal > 0 ? npsSum / npsTotal : null;
  const npsScore = npsTotal > 0
    ? Math.round(((promoters - detractors) / npsTotal) * 100)
    : 0;

  const stats = {
    total,
    npsAvg,
    csatAvg: csatAggr._avg?.score ?? null,
    cesAvg: cesAggr._avg?.score ?? null,
    promoters,
    passives,
    detractors,
    npsScore,
    byType: byTypeMap,
    byStatus: byStatusMap,
  };

  return NextResponse.json({ items, total, stats });
}
