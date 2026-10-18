import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { setInternal } from '@/lib/admin/trial';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/customers/[id]/internal { isInternal, reason } - Gastrux team only (spec 2026-10-18 §8) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  const result = await setInternal({
    restaurantId: params.id,
    isInternal: body.isInternal,
    reason: body.reason,
    actor: { id: String(user.id), email: String(user.email) },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ isInternal: result.isInternal });
}
