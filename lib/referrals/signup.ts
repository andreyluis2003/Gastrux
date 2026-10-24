import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { newReferralCode, normalizeReferralCode } from './rules';

/** The referral link at signup (plan 2026-10-24 indicacao, Task 3) */

/** The owner of a restaurant (the model has ownerId, no relation) */
export async function ownerOf(restaurantId: string): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ownerId: true } });
  return r ? prisma.user.findUnique({ where: { id: r.ownerId }, select: { id: true, email: true, name: true } }) : null;
}

export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The restaurant behind a code; an internal (test) restaurant never refers */
export async function findReferrer(code: unknown): Promise<{ restaurantId: string; name: string } | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const r = await prisma.restaurant.findUnique({ where: { referralCode: normalized }, select: { id: true, name: true, isInternal: true } });
  return r && !r.isInternal ? { restaurantId: r.id, name: r.name } : null;
}

/** The restaurant's code, made on first use */
export async function referralCodeFor(restaurantId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { referralCode: true } });
    if (!r) throw new Error('Restaurante não encontrado');
    if (r.referralCode) return r.referralCode;
    try {
      await prisma.restaurant.updateMany({ where: { id: restaurantId, referralCode: null }, data: { referralCode: newReferralCode() } });
    } catch (e: any) {
      // Another restaurant has this code already: draw another one
      if (e?.code !== 'P2002') throw e;
    }
  }
  throw new Error('Não foi possível criar o código de indicação');
}

/** The referred restaurant enters the program; the referrer's owner hears it. Never throws: the signup goes on. */
export async function attachReferral(referredRestaurantId: string, referrer: { restaurantId: string }): Promise<void> {
  try {
    if (referredRestaurantId === referrer.restaurantId) return;
    await prisma.referral.create({ data: { referrerRestaurantId: referrer.restaurantId, referredRestaurantId } });
    const [owner, referred] = await Promise.all([
      ownerOf(referrer.restaurantId),
      prisma.restaurant.findUnique({ where: { id: referredRestaurantId }, select: { name: true } }),
    ]);
    if (!owner?.email) return;
    sendTransactionalEmail({
      to: owner.email,
      notificationId: 'referral-signup',
      subject: 'Um restaurante se cadastrou pelo seu link do Gastrux',
      html: `<p>Olá${owner.name ? `, ${escape(owner.name)}` : ''}!</p>
<p><strong>${escape(referred?.name ?? 'Um restaurante')}</strong> se cadastrou no Gastrux pelo seu link de indicação e está no teste grátis.</p>
<p>Quando ele pagar a primeira mensalidade e continuar assinando por 7 dias, você ganha <strong>1 mês grátis</strong> do seu plano.</p>
<p>Acompanhe em Minha assinatura &gt; Indique e ganhe.</p>`,
    }).catch((e) => console.error('[referral] signup e-mail failed:', e?.message ?? e));
  } catch (e: any) {
    console.error('[referral] could not attach the referral:', e?.message ?? e);
  }
}
