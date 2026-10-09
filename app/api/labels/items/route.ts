// @ts-nocheck
import { NextResponse } from 'next/server';
import { requireLabelAccess } from '@/lib/labels/access';
import { listLabelItems } from '@/lib/labels/service';

export const dynamic = 'force-dynamic';

/** GET /api/labels/items - preparations and ingredients to label, most used in 30 days first */
export async function GET() {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listLabelItems(auth.member.restaurantId));
}
