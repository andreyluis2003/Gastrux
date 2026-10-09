// @ts-nocheck
import { NextResponse } from 'next/server';
import { enforceFeature } from '@/lib/api/tier-middleware';
import { requireLabelAccess } from '@/lib/labels/access';
import { expiryBoard } from '@/lib/labels/settle';

export const dynamic = 'force-dynamic';

/** GET /api/labels/expiry - expired, today, tomorrow and the settled history (Pro and up) */
export async function GET() {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const tierBlock = await enforceFeature(auth.member.restaurantId, 'labelExpiry');
  if (tierBlock) return tierBlock;
  return NextResponse.json(await expiryBoard(auth.member.restaurantId));
}
