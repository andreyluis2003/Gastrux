import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe-connect';
import { findPayingSubscription } from '@/lib/billing/cancel';
import { monthValueCents } from './rules';
import { ownerOf } from './signup';

/**
 * The earned free months of a referring restaurant go on its Stripe invoice (plan 2026-10-24 indicacao, Task 5): a
 * credit on the customer balance, which Stripe takes off the next invoice by itself.
 *
 * Only an owner with a Stripe subscription that exists (not a checkout merely opened, final review I2), and the month
 * is worth the plan that subscription bills, decided now (final review I3). A credit is never made twice: the
 * idempotency key covers a retry within Stripe's 24 h, and the referral id in the credit's metadata covers a later run
 * after a failed database write (final review M1).
 */
export async function applyEarnedOnStripe(restaurantId: string): Promise<number> {
  const owner = await ownerOf(restaurantId);
  if (!owner) return 0;
  const paying = await findPayingSubscription(owner.id);
  if (paying?.gateway !== 'STRIPE') return 0;
  const amount = monthValueCents(paying.tier);
  if (!amount) return 0;
  const customer = (await prisma.user.findUnique({ where: { id: owner.id }, select: { stripeCustomerId: true } }))?.stripeCustomerId;
  if (!customer) return 0;

  const rows = await prisma.referral.findMany({
    where: { referrerRestaurantId: restaurantId, status: 'EARNED' },
    select: { id: true },
    orderBy: { earnedAt: 'asc' },
  });
  if (!rows.length) return 0;

  let existing: Map<string, string>;
  try {
    const list = await stripe.customers.listBalanceTransactions(customer, { limit: 100 });
    existing = new Map(list.data.filter((t) => t.metadata?.referralId).map((t) => [String(t.metadata!.referralId), t.id]));
  } catch (e: any) {
    console.error('[referral] could not read the Stripe balance:', e?.message ?? e);
    return 0;
  }

  let applied = 0;
  for (const row of rows) {
    try {
      const txnId = existing.get(row.id) ?? (await stripe.customers.createBalanceTransaction(
        customer,
        { amount: -amount, currency: 'brl', description: 'Indicação: 1 mês grátis', metadata: { referralId: row.id } },
        { idempotencyKey: `referral-${row.id}` },
      )).id;
      const moved = await prisma.referral.updateMany({
        where: { id: row.id, status: 'EARNED' },
        data: { status: 'APPLIED', appliedAt: new Date(), appliedRef: txnId, amountCents: amount },
      });
      if (!moved.count) console.warn(`[referral] Stripe credit ${txnId} made but referral ${row.id} changed meanwhile (cancelled?)`);
      applied += moved.count;
    } catch (e: any) {
      // Stays EARNED: the next run tries again (the metadata finds a credit already made)
      console.error(`[referral] Stripe credit for ${row.id} failed:`, e?.message ?? e);
    }
  }
  return applied;
}
