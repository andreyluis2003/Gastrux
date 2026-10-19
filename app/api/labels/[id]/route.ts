// @ts-nocheck
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLabelAccess } from '@/lib/labels/access';
import { getLabel } from '@/lib/labels/settle';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';

export const dynamic = 'force-dynamic';

/** GET /api/labels/[id] - the label opened by its QR code (only someone of the same restaurant) */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const label = await getLabel(auth.member.restaurantId, params.id);
  if (!label) return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 });
  return NextResponse.json({ ...label, canSettle: isTierFeatureEnabled(await restaurantTier(auth.member.restaurantId), 'labelExpiry') });
}
