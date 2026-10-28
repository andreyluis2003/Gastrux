import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { getPlatformAdminSession } from '@/lib/admin/guard';
import { runActivationAgent } from '@/lib/agents/activation/run';

export const dynamic = 'force-dynamic';

/** POST /api/agents/activation/run - every 5 minutes from the VPS cron (CRON_SECRET), or by the platform team */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    const { session } = await getPlatformAdminSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runActivationAgent());
}
