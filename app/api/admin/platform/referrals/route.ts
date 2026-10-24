import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { referralsForPlatform } from '@/lib/referrals/platform';

export const dynamic = 'force-dynamic';

/** GET /api/admin/platform/referrals - every referral and the month's free months (platform admins) */
export async function GET(_req: NextRequest) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  return NextResponse.json(await referralsForPlatform(), { headers: { 'Cache-Control': 'no-store' } });
}
