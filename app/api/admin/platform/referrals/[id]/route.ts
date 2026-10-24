import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { cancelReferralByStaff, ReferralAdminError } from '@/lib/referrals/platform';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/platform/referrals/[id] { action: 'cancel', reason } - a suspicious referral (audited) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'cancel') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  try {
    await cancelReferralByStaff(String((user as any)?.id ?? ''), params.id, body.reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ReferralAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
