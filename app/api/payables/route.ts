import { NextResponse } from 'next/server';
import { createPayables, listPayables } from '@/lib/payables/service';
import { payableErrorResponse, requirePayablesAccess } from '@/lib/payables/http';

export const dynamic = 'force-dynamic';

/** GET /api/payables?status&category&month - the list with the four cards (spec 2026-10-18 contas a pagar §8) */
export async function GET(request: Request) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const out = await listPayables(auth.member, { status: url.searchParams.get('status'), category: url.searchParams.get('category'), month: url.searchParams.get('month') });
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return payableErrorResponse(error, 'carregar as contas');
  }
}

/** POST /api/payables { description, category, supplierId?, amount, dueDate, competenceMonth?, notes?, mode, installments? } */
export async function POST(request: Request) {
  const auth = await requirePayablesAccess();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await createPayables(auth.member, await request.json().catch(() => ({}))), { status: 201 });
  } catch (error) {
    return payableErrorResponse(error, 'salvar a conta');
  }
}
