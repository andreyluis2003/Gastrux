import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const categorySlug = searchParams.get('category');
  const featured = searchParams.get('featured') === '1';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const where: Record<string, unknown> = { published: true };

  if (categorySlug) {
    const cat = await prisma.helpCategory.findUnique({ where: { slug: categorySlug } });
    if (!cat) return NextResponse.json({ articles: [], category: null });
    where.categoryId = cat.id;
  }

  if (featured) where.featured = true;

  if (q && q.length > 1) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { summary: { contains: q, mode: 'insensitive' } },
      { keywords: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
    ];
  }

  const articles = await prisma.helpArticle.findMany({
    where,
    take: limit,
    orderBy: [{ featured: 'desc' }, { order: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      featured: true,
      views: true,
      helpful: true,
      category: { select: { slug: true, name: true, icon: true } },
      updatedAt: true,
    },
  });

  return NextResponse.json({ articles, count: articles.length });
}
