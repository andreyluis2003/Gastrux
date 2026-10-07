import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { updateCommission } from '@/lib/staff/commissions';

export const dynamic = 'force-dynamic';

/**
 * PATCH { action: 'approve' | 'pay' | 'cancel' | 'adjust', reason?, bonusCents? }: a manager moves a
 * closed commission along (pending -> approved -> paid), cancels it, or adds a bonus / deduction to a
 * pending one, always with a reason. Every change goes to the audit log.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Mexer em comissões exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (!['approve', 'pay', 'cancel', 'adjust'].includes(body.action)) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }
  const result = await updateCommission(auth.member, params.id, {
    action: body.action,
    reason: typeof body.reason === 'string' ? body.reason : '',
    bonusCents: Number(body.bonusCents),
  } as any);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
