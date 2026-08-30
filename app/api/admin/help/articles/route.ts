import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const articles = await prisma.helpArticle.findMany({
    orderBy: [{ createdAt: 'desc' }],
    include: { category: { select: { slug: true, name: true } } },
  });
  return NextResponse.json({ articles });
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const {
    categoryId,
    slug,
    title,
    summary,
    content,
    keywords,
    featured,
    published,
    order,
  } = body;

  if (!categoryId || !slug || !title || !content) {
    return NextResponse.json(
      { error: 'categoryId, slug, title e content são obrigatórios' },
      { status: 400 }
    );
  }

  const existing = await prisma.helpArticle.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: 'Slug já existe' }, { status: 409 });
  }

  const article = await prisma.helpArticle.create({
    data: {
      categoryId,
      slug,
      title,
      summary: summary || null,
      content,
      keywords: keywords || null,
      featured: Boolean(featured),
      published: Boolean(published),
      order: Number(order) || 0,
      publishedAt: published ? new Date() : null,
      authorId: guard.user?.id,
    },
  });

  return NextResponse.json({ article });
}
