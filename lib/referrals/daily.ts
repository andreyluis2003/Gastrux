import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe-connect';
import { getPayment } from '@/lib/mercado-pago';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { findPayingSubscription } from '@/lib/billing/cancel';
import { brtYear, CONFIRM_DAYS, YEARLY_CAP } from './rules';
import { escape, ownerOf } from './signup';
import { applyEarnedOnStripe } from './apply-stripe';

/**
 * The daily referral job (plan 2026-10-24 indicacao, Task 5), POST /api/referrals/daily from the VPS cron:
 * 1. a referred restaurant that paid its first charge 7+ days ago and still pays earns the referrer one free month
 *    (or the referral is cancelled: same owner, internal account, cancelled or refunded, or the year's limit);
 * 2. earned months are applied (Stripe credit; Mercado Pago in Task 6). An owner not subscribed keeps them EARNED.
 */
const DAY_MS = 86_400_000;

type Due = Awaited<ReturnType<typeof dueReferrals>>[number];

function dueReferrals(now: Date) {
  return prisma.referral.findMany({
    where: { status: 'CONFIRMING', firstChargeAt: { lte: new Date(now.getTime() - CONFIRM_DAYS * DAY_MS) } },
    include: {
      referrer: { select: { id: true, ownerId: true, isInternal: true } },
      referred: { select: { id: true, ownerId: true, isInternal: true, name: true } },
    },
  });
}

/** null = the first charge stands; undefined = could not check today (try again tomorrow) */
async function firstChargeRefunded(r: Due): Promise<boolean | undefined> {
  try {
    if (r.gateway === 'MERCADO_PAGO') {
      const p: any = await getPayment(r.firstChargeRef!);
      return ['refunded', 'charged_back'].includes(p?.status) || p?.status_detail === 'partially_refunded';
    }
    const customer = (await prisma.user.findUnique({ where: { id: r.referred.ownerId }, select: { stripeCustomerId: true } }))?.stripeCustomerId;
    if (!customer) return false;
    const since = Math.floor((r.firstChargeAt!.getTime() - DAY_MS) / 1000);
    const charges = await stripe.charges.list({ customer, created: { gte: since }, limit: 20 });
    return charges.data.some((c) => (c.amount_refunded ?? 0) > 0);
  } catch (e: any) {
    console.error(`[referral] refund check of ${r.id} failed:`, e?.message ?? e);
    return undefined;
  }
}

async function cancelReason(r: Due): Promise<string | null | undefined> {
  if (r.referred.ownerId === r.referrer.ownerId) return 'mesmo dono';
  if (r.referrer.isInternal || r.referred.isInternal) return 'conta interna';
  // A subscription still renewing: a Stripe cancel only sets cancel-at-period-end and stays "active" (final review I1)
  if (!(await findPayingSubscription(r.referred.ownerId))) return 'o indicado cancelou em até 7 dias';
  const refunded = await firstChargeRefunded(r);
  if (refunded === undefined) return undefined;
  return refunded ? 'primeira cobrança estornada' : null;
}

async function reachedYearCap(referrerRestaurantId: string, now: Date): Promise<boolean> {
  const earned = await prisma.referral.findMany({
    where: { referrerRestaurantId, status: { in: ['EARNED', 'APPLIED'] }, earnedAt: { gte: new Date(now.getTime() - 400 * DAY_MS) } },
    select: { earnedAt: true },
  });
  const year = brtYear(now);
  return earned.filter((e) => e.earnedAt && brtYear(e.earnedAt) === year).length >= YEARLY_CAP;
}

async function cancel(id: string, reason: string) {
  const moved = await prisma.referral.updateMany({ where: { id, status: 'CONFIRMING' }, data: { status: 'CANCELLED', cancelReason: reason } });
  return moved.count;
}

async function tellEarned(r: Due) {
  const owner = await ownerOf(r.referrer.id);
  if (!owner?.email) return;
  await sendTransactionalEmail({
    to: owner.email,
    notificationId: 'referral-earned',
    subject: 'Você ganhou 1 mês grátis no Gastrux',
    html: `<p>Olá${owner.name ? `, ${escape(owner.name)}` : ''}!</p>
<p><strong>${escape(r.referred.name)}</strong>, que se cadastrou pelo seu link, já é assinante do Gastrux.</p>
<p>Você ganhou <strong>1 mês grátis</strong> do seu plano. Na assinatura pelo cartão, ele é descontado da sua próxima mensalidade; se você ainda está no teste, fica guardado e é descontado da próxima mensalidade depois que você assinar. Acompanhe em Minha assinatura &gt; Indique e ganhe.</p>
<p>Obrigado por indicar o Gastrux!</p>`,
  }).catch((e) => console.error('[referral] earned e-mail failed:', e?.message ?? e));
}

export async function runReferralDaily(now = new Date()): Promise<{ confirmed: number; cancelled: number; applied: number }> {
  const result = { confirmed: 0, cancelled: 0, applied: 0 };

  for (const r of await dueReferrals(now)) {
    const reason = await cancelReason(r);
    if (reason === undefined) continue;
    if (reason) {
      result.cancelled += await cancel(r.id, reason);
      continue;
    }
    if (await reachedYearCap(r.referrer.id, now)) {
      result.cancelled += await cancel(r.id, 'limite do ano');
      continue;
    }
    const moved = await prisma.referral.updateMany({
      where: { id: r.id, status: 'CONFIRMING' },
      // The value is set when the month is applied, from the plan billed then (final review I3)
      data: { status: 'EARNED', earnedAt: now },
    });
    if (moved.count) {
      result.confirmed++;
      await tellEarned(r);
    }
  }

  const referrers = await prisma.referral.findMany({
    where: { status: 'EARNED' },
    distinct: ['referrerRestaurantId'],
    select: { referrerRestaurantId: true },
  });
  for (const { referrerRestaurantId } of referrers) result.applied += await applyEarnedOnStripe(referrerRestaurantId);
  return result;
}
