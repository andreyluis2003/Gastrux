import { NextResponse } from 'next/server';
import { payPayable, undoPayment } from '@/lib/payables/service';
import { payableErrorResponse, requirePayablesAccess } from '@/lib/payables/http';

export const dynamic = 'force-dynamic';

/** POST /api/payables/[id]/pay { method, from: 'DRAWER'|'BANK', paidAt?, cashSessionId?, force? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await payPayable(auth.member, params.id, await request.json().catch(() => ({}))));
  } catch (error) {
    return payableErrorResponse(error, 'registrar o pagamento');
  }
}

/** DELETE /api/payables/[id]/pay { reason, cashSessionId? } - undoes the payment (drawer money goes back) */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await undoPayment(auth.member, params.id, body.reason, body.cashSessionId));
  } catch (error) {
    return payableErrorResponse(error, 'desfazer o pagamento');
  }
}
