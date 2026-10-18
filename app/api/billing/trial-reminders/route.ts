import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { sendTrialReminders } from '@/lib/billing/trial-reminders';

export const dynamic = 'force-dynamic';

/** POST /api/billing/trial-reminders - daily from the VPS cron with CRON_SECRET (spec 2026-10-18 §5) */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await sendTrialReminders());
}
