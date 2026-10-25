import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { tutorialBySlug } from '@/lib/tutorials/catalog';

export const dynamic = 'force-dynamic';

/** The signed-in person's id (the session carries it; the email is only a fallback, as in getRestaurantMember) */
async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = (session.user as { id?: string }).id;
  if (id) return id;
  if (!session.user.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

/** GET /api/tutorials/progress - the tutorial videos this person watched (spec 2026-10-25 tutoriais-em-video) */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const rows = await prisma.tutorialView.findMany({ where: { userId }, select: { slug: true }, orderBy: { watchedAt: 'asc' } });
  return NextResponse.json({ watched: rows.map((r) => r.slug) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/tutorials/progress { slug } - marks a published video as watched (again: refreshes the date) */
export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!tutorialBySlug(slug)) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 400 });
  const now = new Date();
  await prisma.tutorialView.upsert({
    where: { userId_slug: { userId, slug } },
    create: { userId, slug, watchedAt: now },
    update: { watchedAt: now },
  });
  return NextResponse.json({ ok: true });
}
