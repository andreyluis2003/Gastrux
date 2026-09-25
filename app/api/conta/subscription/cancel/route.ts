import { NextResponse } from 'next/server';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { cancelSubscription } from '@/lib/billing/cancel';

export const dynamic = 'force-dynamic';

/** POST: the owner cancels the Gastrux subscription (lib/billing/cancel.ts). */
export async function POST() {
  const auth = await requireRestaurantRole(['OWNER'], 'Só o dono do restaurante pode cancelar a assinatura');
  if (!auth.ok) return auth.response;
  const { member } = auth;

  try {
    const result = await cancelSubscription(member.userId, member.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await recordAudit(member, {
      action: 'STATUS_CHANGE',
      entityType: 'Subscription',
      entityId: result.subscriptionId,
      changes: { status: 'canceled', accessUntil: result.accessUntil },
    });
    return NextResponse.json({ canceled: true, accessUntil: result.accessUntil });
  } catch (error) {
    console.error('[subscription cancel]', error);
    return NextResponse.json(
      { error: 'Não foi possível cancelar agora. Tente de novo em alguns minutos.' },
      { status: 502 }
    );
  }
}
