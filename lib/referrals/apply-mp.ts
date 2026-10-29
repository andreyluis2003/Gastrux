import { prisma } from '@/lib/prisma';
import { getPreApproval, updatePreApproval } from '@/lib/mercado-pago';
import { findPayingSubscription } from '@/lib/billing/cancel';
import { monthValueCents } from './rules';
import { ownerOf } from './signup';

/**
 * The earned free months of a referring restaurant that pays by Mercado Pago (plan 2026-10-24 indicacao, Task 6).
 * MP has no credit, so the referrer skips one charge: the PreApproval is paused before its next charge and resumed
 * the day after. The sandbox experiment of 2026-10-26..29 (docs/mp-pause-experiment.md) showed a paused PreApproval
 * is not charged on its date and not charged for it later. One paused cycle at a time; the next month waits.
 *
 * While paused the webhook syncs the subscription as past_due, which keeps the plan (GRANTING_STATUSES).
 */
const DAY_MS = 86_400_000;

export async function applyEarnedOnMp(restaurantId: string, now = new Date()): Promise<number> {
  const owner = await ownerOf(restaurantId);
  if (!owner) return 0;
  const paying = await findPayingSubscription(owner.id);
  // past_due is a failing charge (or already paused): no free month on top of it
  if (paying?.gateway !== 'MERCADO_PAGO' || paying.status !== 'active' || !paying.gatewaySubscriptionId) return 0;
  const amount = monthValueCents(paying.tier);
  if (!amount) return 0;

  const holding = await prisma.referral.count({ where: { referrerRestaurantId: restaurantId, status: 'APPLIED', resumeAt: { not: null } } });
  if (holding) return 0;
  const row = await prisma.referral.findFirst({
    where: { referrerRestaurantId: restaurantId, status: 'EARNED' },
    select: { id: true },
    orderBy: { earnedAt: 'asc' },
  });
  if (!row) return 0;

  const preId = paying.gatewaySubscriptionId;
  let next: Date;
  try {
    const pre: any = await getPreApproval(preId);
    if (pre?.status !== 'authorized' || !pre.next_payment_date) return 0;
    next = new Date(pre.next_payment_date);
    if (Number.isNaN(next.getTime()) || next <= now) return 0;
  } catch (e: any) {
    console.error(`[referral] could not read the MP PreApproval ${preId}:`, e?.message ?? e);
    return 0;
  }

  // The row is claimed before the pause: a pause whose write was lost would never be resumed (free forever)
  const resumeAt = new Date(next.getTime() + DAY_MS);
  const claimed = await prisma.referral.updateMany({
    where: { id: row.id, status: 'EARNED' },
    data: { status: 'APPLIED', appliedAt: now, appliedRef: preId, amountCents: amount, resumeAt },
  });
  if (!claimed.count) return 0;
  try {
    await updatePreApproval(preId, 'paused');
    return 1;
  } catch (e: any) {
    console.error(`[referral] MP pause for ${row.id} failed:`, e?.message ?? e);
    await prisma.referral.updateMany({
      where: { id: row.id, status: 'APPLIED' },
      data: { status: 'EARNED', appliedAt: null, appliedRef: null, amountCents: null, resumeAt: null },
    });
    return 0;
  }
}

/** Resumes the PreApprovals whose skipped charge is past. One the owner cancelled meanwhile is left alone. */
export async function resumeSkipped(now = new Date()): Promise<number> {
  const rows = await prisma.referral.findMany({
    where: { status: 'APPLIED', resumeAt: { lte: now }, appliedRef: { not: null } },
    select: { id: true, appliedRef: true },
  });
  let resumed = 0;
  for (const row of rows) {
    try {
      const pre: any = await getPreApproval(row.appliedRef!);
      if (pre?.status === 'paused') {
        await updatePreApproval(row.appliedRef!, 'authorized');
        resumed++;
      }
      await prisma.referral.update({ where: { id: row.id }, data: { resumeAt: null } });
    } catch (e: any) {
      // Stays with resumeAt: the next run tries again
      console.error(`[referral] MP resume for ${row.id} failed:`, e?.message ?? e);
    }
  }
  return resumed;
}
