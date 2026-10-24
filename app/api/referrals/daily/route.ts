import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { runReferralDaily } from '@/lib/referrals/daily';

export const dynamic = 'force-dynamic';

/** POST /api/referrals/daily - daily from the VPS cron with CRON_SECRET (plan 2026-10-24 indicacao, Task 5) */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runReferralDaily());
}
