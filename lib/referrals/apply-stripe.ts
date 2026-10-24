import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe-connect';
import { findPayingSubscription } from '@/lib/billing/cancel';
import { ownerOf } from './signup';

/**
 * The earned free months of a referring restaurant go on its Stripe invoice (plan 2026-10-24 indicacao, Task 5): a
 * credit on the customer balance, which Stripe takes off the next invoice by itself. The idempotency key is the
 * referral id, so a repeated run or a run racing the checkout never credits twice.
 *
 * `customerId` is given by the Stripe checkout (the owner is about to subscribe: the credit lands on the first invoice);
 * without it, only an owner already subscribed on Stripe is credited.
 */
export async function applyEarnedOnStripe(restaurantId: string, customerId?: string): Promise<number> {
  let customer = customerId;
  if (!customer) {
    const owner = await ownerOf(restaurantId);
    if (!owner) return 0;
    const paying = await findPayingSubscription(owner.id);
    if (paying?.gateway !== 'STRIPE') return 0;
    customer = (await prisma.user.findUnique({ where: { id: owner.id }, select: { stripeCustomerId: true } }))?.stripeCustomerId ?? undefined;
  }
  if (!customer) return 0;

  const rows = await prisma.referral.findMany({
    where: { referrerRestaurantId: restaurantId, status: 'EARNED', amountCents: { gt: 0 } },
    select: { id: true, amountCents: true },
    orderBy: { earnedAt: 'asc' },
  });
  let applied = 0;
  for (const row of rows) {
    try {
      const txn = await stripe.customers.createBalanceTransaction(
        customer,
        { amount: -row.amountCents!, currency: 'brl', description: 'Indicação: 1 mês grátis' },
        { idempotencyKey: `referral-${row.id}` },
      );
      const moved = await prisma.referral.updateMany({
        where: { id: row.id, status: 'EARNED' },
        data: { status: 'APPLIED', appliedAt: new Date(), appliedRef: txn.id },
      });
      applied += moved.count;
    } catch (e: any) {
      // Stays EARNED: the next run tries again (same idempotency key)
      console.error(`[referral] Stripe credit for ${row.id} failed:`, e?.message ?? e);
    }
  }
  return applied;
}
