// @ts-nocheck
/**
 * SaaS billing checkout via Mercado Pago (PreApproval / recurring subscription).
 * Mirrors app/api/billing/checkout-session/route.ts (the Stripe equivalent) -
 * NOT the restaurant-order-payment routes under app/api/pagamentos/mp/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { findPayingSubscription } from '@/lib/billing/cancel';
import { getTierById } from '@/lib/stripe-config';
import { createPreApproval, getMPAutoRecurringForBillingCycle } from '@/lib/mercado-pago';

export const dynamic = 'force-dynamic';

const TRIAL_DAYS = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { tierId, billing } = await request.json();
    if (!tierId) {
      return NextResponse.json({ error: 'Escolha um plano' }, { status: 400 });
    }

    const tier = getTierById(tierId);
    if (!tier) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });
    }

    if (tierId === 'starter') {
      return NextResponse.json({ error: 'O plano Starter é gratuito e não precisa de pagamento' }, { status: 400 });
    }

    // Only the owner subscribes, for the restaurant being worked in: the plan is copied to the
    // restaurants the subscriber owns (lib/billing/subscription-sync.ts), so a manager's payment
    // used to upgrade nothing.
    const auth = await requireRestaurantRole(['OWNER'], 'Só o dono do restaurante pode assinar um plano');
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const paying = await findPayingSubscription(member.userId);
    if (paying) {
      return NextResponse.json(
        { error: `Você já tem uma assinatura ativa (${paying.planName || paying.tier}). Para trocar de plano, cancele a atual em Conta › Cobrança.` },
        { status: 409 }
      );
    }
    // One free trial per owner: cancel-and-subscribe-again must not restart it
    const hadTrial = (await prisma.subscription.count({
      where: { userId: member.userId, trialStart: { not: null }, status: { not: 'incomplete' } },
    })) > 0;

    const isAnnual = billing === 'annual';
    const amount = isAnnual ? tier.priceAnnual : tier.priceMonthly;

    const user = await prisma.user.findUnique({
      where: { id: member.userId },
    });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://gastrux.com';
    const billingCycle: 'monthly' | 'annual' = isAnnual ? 'annual' : 'monthly';

    const subscription = await prisma.subscription.create({
      data: {
        restaurantId: member.restaurantId,
        userId: user.id,
        tier: tier.id,
        planName: tier.name,
        billingCycle,
        gateway: 'MERCADO_PAGO',
        amount,
        currency: 'BRL',
        status: 'incomplete',
        trialStart: hadTrial ? null : new Date(),
        trialEnd: hadTrial ? null : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    let preApproval;
    try {
      preApproval = await createPreApproval({
        payerEmail: user.email,
        backUrl: `${origin}/billing/success?subscription_id=${subscription.id}`,
        reason: `Assinatura ${tier.name} - Gastrux`,
        externalReference: subscription.id,
        autoRecurring: {
          ...getMPAutoRecurringForBillingCycle(billingCycle),
          transactionAmount: amount,
          currencyId: 'BRL',
          billingDayProportional: true,
          ...(hadTrial ? {} : { freeTrial: { frequency: TRIAL_DAYS, frequencyType: 'days' } }),
        },
      });
    } catch (mpError) {
      // Clean up the incomplete row rather than leaving an orphaned Subscription
      // with no gatewaySubscriptionId if Mercado Pago rejects the request.
      await prisma.subscription.delete({ where: { id: subscription.id } }).catch(() => {});
      throw mpError;
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { gatewaySubscriptionId: preApproval.id },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      // Mirrors Stripe's checkout-session route response shape ({ url }) so
      // the frontend doesn't need to know which gateway it called.
      // Unlike the Preference (order-checkout) API, PreApproval's response
      // only ever has `init_point` - there is no separate sandbox_init_point
      // field. Sandbox vs production is determined entirely by which access
      // token (TEST- vs APP_USR-) created the PreApproval, not by the URL.
      url: preApproval.init_point,
    });
  } catch (error) {
    console.error('[MP checkout-session] Error:', error);
    return NextResponse.json(
      { error: 'Não foi possível abrir o pagamento no Mercado Pago. Tente de novo em alguns minutos.' },
      { status: 500 }
    );
  }
}
