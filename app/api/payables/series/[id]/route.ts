import { NextResponse } from 'next/server';
import { stopSeries } from '@/lib/payables/service';
import { payableErrorResponse, requirePayablesAccess } from '@/lib/payables/http';

export const dynamic = 'force-dynamic';

/** PATCH /api/payables/series/[id] { active: false } - stops repeating; the bills already created stay */
export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await stopSeries(auth.member, params.id));
  } catch (error) {
    return payableErrorResponse(error, 'parar a repetição');
  }
}
