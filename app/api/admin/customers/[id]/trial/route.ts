import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { extendTrial } from '@/lib/admin/trial';

export const dynamic = 'force-dynamic';

/** POST /api/admin/customers/[id]/trial { days | until, reason } - Gastrux team only (spec 2026-10-18 §8) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  const result = await extendTrial({
    restaurantId: params.id,
    days: body.days,
    until: body.until,
    reason: body.reason,
    actor: { id: String(user.id), email: String(user.email) },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trialEndsAt: result.trialEndsAt });
}
