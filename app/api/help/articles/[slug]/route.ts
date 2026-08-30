import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const article = await prisma.helpArticle.findUnique({
    where: { slug: params.slug },
    include: { category: true },
  });

  if (!article || !article.published) {
    return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
  }

  // Fire-and-forget view count
  prisma.helpArticle.update({
    where: { id: article.id },
    data: { views: { increment: 1 } },
  }).catch(() => undefined);

  // Related in same category (up to 4)
  const related = await prisma.helpArticle.findMany({
    where: {
      categoryId: article.categoryId,
      published: true,
      id: { not: article.id },
    },
    take: 4,
    orderBy: [{ featured: 'desc' }, { order: 'asc' }],
    select: { slug: true, title: true, summary: true },
  });

  return NextResponse.json({ article, related });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;
  if (action !== 'helpful' && action !== 'not_helpful') {
    return NextResponse.json({ error: 'Action inválida' }, { status: 400 });
  }

  const article = await prisma.helpArticle.findUnique({ where: { slug: params.slug } });
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.helpArticle.update({
    where: { id: article.id },
    data: action === 'helpful' ? { helpful: { increment: 1 } } : { notHelpful: { increment: 1 } },
    select: { helpful: true, notHelpful: true },
  });

  return NextResponse.json({ success: true, ...updated });
}
