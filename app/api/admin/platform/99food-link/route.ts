import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformStaffEmail } from '@/lib/admin/guard';
import { NinetynineError } from '@/lib/ninetynine/client';
import { NinetynineConnectError, staffLink } from '@/lib/ninetynine/connect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/platform/99food-link { restaurantId, appShopId } - links a 99Food store the app is authorized on to a
 * restaurant (the test store, or "Não encontramos sua loja"). Gastrux staff only (PLATFORM_ADMIN_EMAILS), never the
 * global ADMIN role.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isPlatformStaffEmail((session?.user as any)?.email)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const result = await staffLink(body?.restaurantId, body?.appShopId);
    console.log(`[99food] staff ${(session!.user as any).email} linked store ${result.store.appShopId} to restaurant ${body.restaurantId}`);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NinetynineConnectError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof NinetynineError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
