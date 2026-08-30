import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cache, invalidate } from '@/lib/cache';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  const allowed: UserRole[] = [UserRole.OWNER, UserRole.ADMIN];
  if (!session || !role || !allowed.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const stats = await cache.stats();
  return NextResponse.json({
    stats,
    redisConfigured: Boolean(process.env.REDIS_URL),
    driver: stats.driver,
  });
}

export async function DELETE(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(req.url);
  const pattern = searchParams.get('pattern') || undefined;

  if (pattern) {
    await invalidate(pattern);
  } else {
    await cache.clear();
  }
  return NextResponse.json({ ok: true, cleared: pattern || 'all' });
}
