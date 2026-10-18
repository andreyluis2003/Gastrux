import { NextResponse } from 'next/server';
import { cancelPayable, editPayable } from '@/lib/payables/service';
import { payableErrorResponse, requirePayablesAccess } from '@/lib/payables/http';

export const dynamic = 'force-dynamic';

/** PATCH /api/payables/[id] { description?, amount?, dueDate?, competenceMonth?, category?, notes?, supplierId?, scope?: 'THIS'|'NEXT' } */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await editPayable(auth.member, params.id, await request.json().catch(() => ({}))));
  } catch (error) {
    return payableErrorResponse(error, 'editar a conta');
  }
}

/** DELETE /api/payables/[id] { reason } - cancels the bill (it stays in the history) */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await cancelPayable(auth.member, params.id, body.reason));
  } catch (error) {
    return payableErrorResponse(error, 'cancelar a conta');
  }
}
