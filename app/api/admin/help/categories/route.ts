import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const categories = await prisma.helpCategory.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { articles: true } } },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const { slug, name, description, icon, order, visible } = body;

  if (!slug || !name) {
    return NextResponse.json({ error: 'slug e name são obrigatórios' }, { status: 400 });
  }

  const category = await prisma.helpCategory.create({
    data: {
      slug,
      name,
      description: description || null,
      icon: icon || null,
      order: Number(order) || 0,
      visible: visible !== false,
    },
  });
  return NextResponse.json({ category });
}
