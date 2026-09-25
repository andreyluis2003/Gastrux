import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cache, invalidate } from '@/lib/cache';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
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
