// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const source = searchParams.get('source');
  const stage = searchParams.get('stage');
  const segment = searchParams.get('segment');
  const sort = searchParams.get('sort') || 'recent'; // recent | score | name
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const where: any = {};
  if (status) where.status = status;
  if (source) where.source = source;
  if (stage) where.stage = stage;
  if (segment) where.segment = segment;

  const orderBy = sort === 'score'
    ? { score: 'desc' as const }
    : sort === 'name'
      ? { name: 'asc' as const }
      : { createdAt: 'desc' as const };

  const [leads, total, stats] = await Promise.all([
    prisma.marketingLead.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.marketingLead.count({ where }),
    Promise.all([
      prisma.marketingLead.count(),
      prisma.marketingLead.count({ where: { status: 'NEW' } }),
      prisma.marketingLead.count({ where: { status: 'QUALIFIED' } }),
      prisma.marketingLead.count({ where: { status: 'CONVERTED' } }),
      prisma.marketingLead.count({ where: { status: 'LOST' } }),
      prisma.marketingLead.groupBy({
        by: ['source'],
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } },
      }),
      prisma.marketingLead.groupBy({
        by: ['stage'],
        _count: { stage: true },
      }),
      prisma.marketingLead.groupBy({
        by: ['segment'],
        where: { segment: { not: null } },
        _count: { segment: true },
        orderBy: { _count: { segment: 'desc' } },
      }),
      prisma.marketingLead.aggregate({
        _avg: { score: true },
      }),
    ]),
  ]);

  const [totalAll, newCount, qualified, converted, lost, bySource, byStage, bySegment, avgScore] = stats;

  return NextResponse.json({
    leads,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: {
      total: totalAll,
      new: newCount,
      qualified,
      converted,
      lost,
      avgScore: Math.round(avgScore._avg.score || 0),
      conversionRate: totalAll > 0 ? ((converted / totalAll) * 100).toFixed(1) : '0.0',
      bySource: bySource.reduce((acc: any, s: any) => {
        acc[s.source] = s._count.source;
        return acc;
      }, {}),
      byStage: byStage.reduce((acc: any, s: any) => {
        acc[s.stage] = s._count.stage;
        return acc;
      }, {}),
      bySegment: bySegment.map((s: any) => ({
        segment: s.segment,
        count: s._count.segment,
      })),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { calculateLeadScore } = await import('@/lib/marketing/lead-scoring');

    const score = calculateLeadScore({
      source: body.source || 'MANUAL',
      hasPhone: !!body.phoneNumber,
      hasEmail: !!body.email,
      hasBusinessName: !!body.businessName,
      segment: body.segment,
    });

    const lead = await prisma.marketingLead.create({
      data: {
        source: body.source || 'MANUAL',
        sourceDetail: body.sourceDetail,
        name: body.name,
        email: body.email,
        phoneNumber: body.phoneNumber,
        businessName: body.businessName,
        segment: body.segment,
        notes: body.notes,
        score,
        tags: body.tags || [],
      },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (err: any) {
    console.error('[admin-leads] create error:', err?.message || err);
    return NextResponse.json({ error: 'Erro ao criar lead' }, { status: 500 });
  }
}
