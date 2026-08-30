// @ts-nocheck
/**
 * Stripe Webhook Handler (Unified)
 * POST /api/pagamentos/stripe/webhook
 *
 * Handles events for both direct Stripe payments AND Stripe Connect accounts
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, getWebhookSecret, mapStripePaymentStatus, mapStripeRefundStatus } from '@/lib/stripe-connect';
import { logPaymentEvent, PaymentEventType } from '@/lib/payment-logger';
import { captureException, addBreadcrumb } from '@/lib/sentry';
import { createPaymentAlert } from '@/lib/payment-alert-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    const secret = await getWebhookSecret();

    if (!signature || !secret) {
      return NextResponse.json(
        { error: 'Missing signature or secret' },
        { status: 400 }
      );
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
    } catch (err: any) {
      console.error('[Stripe Webhook] Invalid signature:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    addBreadcrumb('Stripe webhook received', {
      type: event.type,
      id: event.id,
      account: event.account,
    });

    await logPaymentEvent({
      eventType: PaymentEventType.WEBHOOK_RECEIVED,
      stripeEventId: event.id,
      metadata: {
        type: event.type,
        account: event.account,
      },
    });

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;
      case 'payout.created':
        await handlePayoutCreated(event.data.object);
        break;
      case 'payout.paid':
        await handlePayoutPaid(event.data.object);
        break;
      case 'transfer.created':
        await handleTransferCreated(event.data.object);
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
        await handleChargeDispute(event.data.object, event.type);
        break;
      case 'charge.dispute.closed':
        await handleChargeDispute(event.data.object, event.type);
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    await logPaymentEvent({
      eventType: PaymentEventType.WEBHOOK_PROCESSED,
      stripeEventId: event.id,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/stripe/webhook',
    });
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 200 } // Stripe expects 200
    );
  }
}

async function handlePaymentIntentSucceeded(pi: any) {
  const paymentId = pi.metadata?.paymentId;
  if (!paymentId) return;

  const mappedStatus = mapStripePaymentStatus(pi.status);
  const charge = pi.charges?.data?.[0];

  // Update payment
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: mappedStatus,
      processedAt: new Date(),
      gatewayFee: charge?.balance_transaction?.fee ? charge.balance_transaction.fee / 100 : 0,
      netAmount: charge?.amount_captured ? charge.amount_captured / 100 - (charge.balance_transaction?.fee || 0) / 100 : undefined,
    },
  });

  // Update StripeTransaction
  await prisma.stripeTransaction.updateMany({
    where: { stripePaymentIntentId: pi.id },
    data: {
      stripeStatus: pi.status,
      stripeChargeId: charge?.id,
      stripeReceiptUrl: charge?.receipt_url,
      paymentMethodType: charge?.payment_method_details?.type,
      paymentMethodDetails: charge?.payment_method_details ? JSON.stringify(charge.payment_method_details) : null,
      cardBrand: charge?.payment_method_details?.card?.brand,
      cardLast4: charge?.payment_method_details?.card?.last4,
      cardExpMonth: charge?.payment_method_details?.card?.exp_month,
      cardExpYear: charge?.payment_method_details?.card?.exp_year,
      cardNetwork: charge?.payment_method_details?.card?.network,
      lastWebhookAt: new Date(),
      webhookPayload: JSON.stringify(pi),
    },
  });

  await logPaymentEvent({
    eventType: PaymentEventType.PAYMENT_INTENT_SUCCEEDED,
    amount: pi.amount / 100,
    currency: pi.currency?.toUpperCase(),
    status: mappedStatus,
    metadata: { paymentIntentId: pi.id, chargeId: charge?.id },
  });

  try {
    await createPaymentAlert({
      alertType: 'approved',
      severity: 'low',
      title: 'Pagamento Aprovado (Stripe)',
      message: `Pagamento de R$ ${(pi.amount / 100).toFixed(2)} aprovado via Stripe.`,
      paymentId,
      gateway: 'STRIPE',
      amount: pi.amount / 100,
    });
  } catch (e) {
    console.warn('[Stripe Webhook] Alert publish error (non-fatal):', e);
  }

  console.log(`[Stripe Webhook] Payment ${paymentId} succeeded`);
}

async function handlePaymentIntentFailed(pi: any) {
  const paymentId = pi.metadata?.paymentId;
  if (!paymentId) return;

  const mappedStatus = mapStripePaymentStatus(pi.status);

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: mappedStatus },
  });

  await prisma.stripeTransaction.updateMany({
    where: { stripePaymentIntentId: pi.id },
    data: {
      stripeStatus: pi.status,
      lastWebhookAt: new Date(),
      webhookPayload: JSON.stringify(pi),
    },
  });

  await logPaymentEvent({
    eventType: PaymentEventType.PAYMENT_INTENT_FAILED,
    status: mappedStatus,
    metadata: { paymentIntentId: pi.id, error: pi.last_payment_error?.message },
  });

  try {
    await createPaymentAlert({
      alertType: 'failure',
      severity: 'high',
      title: 'Falha no Pagamento (Stripe)',
      message: `Pagamento recusado. ${pi.last_payment_error?.message || 'Motivo não informado.'}`,
      paymentId,
      gateway: 'STRIPE',
      amount: (pi.amount || 0) / 100,
    });
  } catch (e) {
    console.warn('[Stripe Webhook] Alert publish error (non-fatal):', e);
  }
}

async function handlePaymentIntentCanceled(pi: any) {
  const paymentId = pi.metadata?.paymentId;
  if (!paymentId) return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'CANCELLED' },
  });

  await prisma.stripeTransaction.updateMany({
    where: { stripePaymentIntentId: pi.id },
    data: {
      stripeStatus: 'canceled',
      lastWebhookAt: new Date(),
    },
  });
}

async function handleChargeRefunded(charge: any) {
  const paymentId = charge.metadata?.paymentId;
  if (!paymentId) return;

  const refund = charge.refunds?.data?.[0];
  if (!refund) return;

  const totalRefunded = charge.amount_refunded / 100;
  const isFullRefund = charge.refunded;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      amountRefunded: totalRefunded,
      refundedAt: new Date(refund.created * 1000),
    },
  });

  await prisma.paymentRefund.upsert({
    where: { gatewayRefundId: refund.id },
    update: { status: 'completed', completedAt: new Date() },
    create: {
      paymentId,
      amount: refund.amount / 100,
      currency: charge.currency?.toUpperCase() || 'BRL',
      gateway: 'STRIPE_CONNECT',
      gatewayRefundId: refund.id,
      status: 'completed',
      reason: refund.reason || 'requested_by_customer',
      description: `Stripe refund: ${refund.id}`,
      completedAt: new Date(),
    },
  });

  await logPaymentEvent({
    eventType: PaymentEventType.PAYMENT_INTENT_SUCCEEDED, // reuse for refund tracking
    status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    metadata: { chargeId: charge.id, refundId: refund.id },
  });

  try {
    await createPaymentAlert({
      alertType: 'refund',
      severity: 'medium',
      title: 'Reembolso Processado (Stripe)',
      message: `Reembolso de R$ ${(refund.amount / 100).toFixed(2)} processado via Stripe.`,
      paymentId,
      gateway: 'STRIPE',
      amount: refund.amount / 100,
    });
  } catch (e) {
    console.warn('[Stripe Webhook] Alert publish error (non-fatal):', e);
  }
}

async function handleAccountUpdated(account: any) {
  // Update restaurant based on Stripe account
  const restaurant = await prisma.restaurant.findFirst({
    where: { stripeAccountId: account.id },
  });

  if (restaurant) {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        // You can add fields like chargesEnabled, payoutsEnabled to restaurant
      },
    });
  }

  console.log(`[Stripe Webhook] Account ${account.id} updated`, {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  });
}

async function handlePayoutCreated(payout: any) {
  await createSettlement(payout, 'pending');
}

async function handlePayoutPaid(payout: any) {
  await createSettlement(payout, 'completed');
}

async function handleTransferCreated(transfer: any) {
  await createSettlement(transfer, 'pending');
}

async function createSettlement(data: any, status: string) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { stripeAccountId: data.destination || data.account },
  });

  if (!restaurant) return;

  await prisma.settlement.upsert({
    where: { gatewayTransferId: data.id },
    update: {
      status,
      grossAmount: data.amount / 100,
      netAmount: (data.amount - (data.fee || 0)) / 100,
      completedAt: status === 'completed' ? new Date(data.arrival_date * 1000) : null,
    },
    create: {
      restaurantId: restaurant.id,
      gateway: 'STRIPE_CONNECT',
      gatewayTransferId: data.id,
      grossAmount: data.amount / 100,
      feeAmount: (data.fee || 0) / 100,
      netAmount: (data.amount - (data.fee || 0)) / 100,
      currency: data.currency?.toUpperCase() || 'BRL',
      status,
      expectedDate: data.arrival_date ? new Date(data.arrival_date * 1000) : null,
    },
  });
}

async function handleChargeDispute(dispute: any, eventType: string) {
  try {
    // Try to find associated payment via charge metadata
    const chargeId = dispute.charge;
    let paymentId: string | null = null;
    let amountNum = (dispute.amount || 0) / 100;

    if (chargeId) {
      const stripeTx = await prisma.stripeTransaction.findFirst({
        where: { stripeChargeId: String(chargeId) },
        include: { payment: true },
      });
      if (stripeTx?.payment) {
        paymentId = stripeTx.payment.id;
        amountNum = Number(stripeTx.payment.amount) || amountNum;

        // Persist CHARGEBACK status on payment when dispute opened
        if (eventType === 'charge.dispute.created') {
          await prisma.payment.update({
            where: { id: paymentId },
            data: { status: 'CHARGEBACK' },
          });
        }
      }
    }

    const isClosed = eventType === 'charge.dispute.closed';
    const isWon = isClosed && dispute.status === 'won';

    await createPaymentAlert({
      alertType: isClosed ? 'dispute' : 'chargeback',
      severity: isClosed ? (isWon ? 'medium' : 'critical') : 'critical',
      title: isClosed
        ? `Disputa ${isWon ? 'Vencida' : 'Perdida'} (Stripe)`
        : 'Disputa/Chargeback Aberta (Stripe)',
      message: isClosed
        ? `Disputa encerrada com status: ${dispute.status}. Valor: R$ ${amountNum.toFixed(2)}.`
        : `Disputa aberta no valor de R$ ${amountNum.toFixed(2)}. Prazo: ${
            dispute.evidence_details?.due_by
              ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString('pt-BR')
              : '7 dias'
          }.`,
      paymentId,
      gateway: 'STRIPE',
      amount: amountNum,
    });
  } catch (err) {
    console.error('[Stripe Webhook] dispute handler error:', err);
  }
}
