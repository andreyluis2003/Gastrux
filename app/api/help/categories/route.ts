import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { seedDefaultHelpContent } from '@/lib/help/seed-articles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await seedDefaultHelpContent();
  } catch (e) {
    console.error('[help/categories] seed error:', e);
  }

  const categories = await prisma.helpCategory.findMany({
    where: { visible: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { articles: { where: { published: true } } },
      },
    },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      order: c.order,
      articleCount: c._count.articles,
    })),
  });
}
