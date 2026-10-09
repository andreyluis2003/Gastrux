// @ts-nocheck
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { enforceFeature } from '@/lib/api/tier-middleware';
import { requireLabelAccess } from '@/lib/labels/access';
import { LabelError } from '@/lib/labels/service';
import { settleLabel } from '@/lib/labels/settle';

export const dynamic = 'force-dynamic';

/** POST /api/labels/[id]/settle { action: 'USED' | 'DISCARDED' } - the expiry control is from Pro */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const tierBlock = await enforceFeature(auth.member.restaurantId, 'labelExpiry');
  if (tierBlock) return tierBlock;
  try {
    const { action } = await request.json();
    return NextResponse.json(await settleLabel(auth.member, params.id, action));
  } catch (error) {
    if (error instanceof LabelError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[labels] settle failed:', error);
    return NextResponse.json({ error: 'Não foi possível dar baixa' }, { status: 500 });
  }
}

export const POST = idempotent(handlePOST);
