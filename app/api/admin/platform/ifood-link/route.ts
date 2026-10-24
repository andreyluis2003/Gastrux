import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformStaffEmail } from '@/lib/admin/guard';
import { IfoodError } from '@/lib/ifood/client';
import { IfoodConnectError, staffLink } from '@/lib/ifood/connect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/platform/ifood-link { restaurantId, merchantId } - test (centralized) app only: links the iFood test
 * store to a restaurant. Gastrux staff only (PLATFORM_ADMIN_EMAILS), never the global ADMIN role.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isPlatformStaffEmail((session?.user as any)?.email)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const result = await staffLink(body?.restaurantId, body?.merchantId);
    console.log(`[ifood] staff ${(session!.user as any).email} linked merchant ${result.merchant.id} to restaurant ${body.restaurantId}`);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof IfoodConnectError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof IfoodError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
