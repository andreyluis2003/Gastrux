import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformStaffEmail } from '@/lib/admin/guard';
import { NinetynineError } from '@/lib/ninetynine/client';
import { NinetynineConnectError, linkRequests, refuseRequest, staffLink } from '@/lib/ninetynine/connect';

export const dynamic = 'force-dynamic';

/** Gastrux staff only (PLATFORM_ADMIN_EMAILS), never the global ADMIN role: these routes cross restaurants */
async function staffEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;
  return isPlatformStaffEmail(email) ? email! : null;
}

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

/** GET /api/admin/platform/99food-link - the restaurants waiting for their 99Food store to be confirmed */
export async function GET() {
  if (!(await staffEmail())) return UNAUTHORIZED();
  return NextResponse.json({ requests: await linkRequests() }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/admin/platform/99food-link
 * - { restaurantId, appShopId }: links a 99Food store the app is authorized on to a restaurant ("Confirmar ligação" of a
 *   request, the test store, "Não encontramos sua loja") and clears the restaurant's request.
 * - { action: 'refuse', restaurantId }: clears the request and tells the restaurant.
 */
export async function POST(req: NextRequest) {
  const email = await staffEmail();
  if (!email) return UNAUTHORIZED();
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === 'refuse') {
      const result = await refuseRequest(body?.restaurantId);
      console.log(`[99food] staff ${email} refused the link request of restaurant ${body.restaurantId}`);
      return NextResponse.json(result);
    }
    const result = await staffLink(body?.restaurantId, body?.appShopId);
    console.log(`[99food] staff ${email} linked store ${result.store.appShopId} to restaurant ${body.restaurantId}`);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NinetynineConnectError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof NinetynineError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
