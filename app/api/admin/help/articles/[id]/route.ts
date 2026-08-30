import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const article = await prisma.helpArticle.findUnique({
    where: { id: params.id },
    include: { category: true },
  });
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  const fields = ['categoryId', 'slug', 'title', 'summary', 'content', 'keywords', 'order'];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (body.featured !== undefined) data.featured = Boolean(body.featured);
  if (body.published !== undefined) {
    data.published = Boolean(body.published);
    if (body.published) data.publishedAt = new Date();
  }

  const article = await prisma.helpArticle.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ article });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  await prisma.helpArticle.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
