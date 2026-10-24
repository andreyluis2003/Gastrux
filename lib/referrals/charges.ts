import { prisma } from '@/lib/prisma';
import { isChargedInvoice } from '@/lib/billing/stripe-period';

/**
 * The referred restaurant's first paid charge (plan 2026-10-24 indicacao, Task 4). Keyed by the paying owner: the
 * Stripe invoice names only the customer, and one subscription covers all the owner's restaurants. Only a TRIAL row
 * moves, so a repeated webhook or a later charge changes nothing. Never throws: billing goes on.
 */
export async function noteFirstCharge(ownerUserId: string, charge: { gateway: 'STRIPE' | 'MERCADO_PAGO'; ref: string; at: Date }): Promise<void> {
  try {
    await prisma.referral.updateMany({
      where: { status: 'TRIAL', referred: { ownerId: ownerUserId } },
      data: { status: 'CONFIRMING', gateway: charge.gateway, firstChargeRef: charge.ref, firstChargeAt: charge.at },
    });
  } catch (e: any) {
    console.error('[referral] first charge not recorded:', e?.message ?? e);
  }
}

/** From the Stripe invoice.paid webhook; the R$ 0,00 invoice of a starting trial is not a charge */
export async function noteFirstStripeInvoice(invoice: { id: string; customer: unknown; amount_paid?: number | null; created?: number }): Promise<void> {
  if (!isChargedInvoice(invoice) || typeof invoice.customer !== 'string') return;
  const user = await prisma.user.findFirst({ where: { stripeCustomerId: invoice.customer }, select: { id: true } }).catch(() => null);
  if (!user) return;
  await noteFirstCharge(user.id, { gateway: 'STRIPE', ref: invoice.id, at: invoice.created ? new Date(invoice.created * 1000) : new Date() });
}
