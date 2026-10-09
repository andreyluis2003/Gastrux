// @ts-nocheck
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireLabelAccess } from '@/lib/labels/access';
import { createLabels, listRecentLabels, LabelError } from '@/lib/labels/service';

export const dynamic = 'force-dynamic';

/** GET /api/labels - labels printed in the last 30 days (reprint) */
export async function GET() {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listRecentLabels(auth.member.restaurantId));
}

/** POST /api/labels - print: { itemType, itemId, storage, expiresAt?, quantity?, batchId?, copies?, saveAsDefaultDays? } */
async function handlePOST(request: Request) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    return NextResponse.json(await createLabels(auth.member, body), { status: 201 });
  } catch (error) {
    if (error instanceof LabelError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[labels] create failed:', error);
    return NextResponse.json({ error: 'Não foi possível imprimir a etiqueta' }, { status: 500 });
  }
}

// A double tap prints once: the same Idempotency-Key gets the same answer (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
