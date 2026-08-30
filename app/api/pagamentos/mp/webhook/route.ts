// @ts-nocheck
/**
 * Mercado Pago Webhook / IPN Handler
 * POST /api/pagamentos/mp/webhook
 *
 * Receives notifications from Mercado Pago for:
 * - payment (status updates)
 * - merchant_order (order updates)
 * - preapproval (subscription updates)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { getPayment, getMerchantOrder, getPreApproval, mapMPStatusToPaymentStatus, mapMPPaymentType, validateWebhookTopic, MP_WEBHOOK_SECRET, MP_IS_PRODUCTION } from '@/lib/mercado-pago';
import { logPaymentEvent, PaymentEventType } from '@/lib/payment-logger';
import { captureException, addBreadcrumb } from '@/lib/sentry';
import { createPaymentAlert } from '@/lib/payment-alert-service';

export const dynamic = 'force-dynamic';

/**
 * Verify Mercado Pago webhook signature using HMAC-SHA256.
 * MP sends: x-signature: "ts=<ts>,v1=<hmac>"
 * MP sends: x-request-id: "<request-id>"
 *
 * The signature template is:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * which is then HMAC-SHA256'd with the webhook secret.
 */
function verifyMercadoPagoSignature(
  request: NextRequest,
  dataId: string,
  secret: string
): { ok: boolean; reason?: string } {
  if (!secret) return { ok: true }; // No secret configured -> skip verification (dev)

  const xSignature = request.headers.get('x-signature') || '';
  const xRequestId = request.headers.get('x-request-id') || '';

  if (!xSignature) return { ok: false, reason: 'missing x-signature' };

  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k, rest.join('=')];
    })
  ) as { ts?: string; v1?: string };

  if (!parts.ts || !parts.v1) return { ok: false, reason: 'invalid signature parts' };

  const template = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(template).digest('hex');

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
  } catch {
    return { ok: false, reason: 'signature comparison failed' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const topic = url.searchParams.get('topic') || url.searchParams.get('type');
    const id = url.searchParams.get('id') || url.searchParams.get('data.id');

    if (!topic || !id) {
      return NextResponse.json(
        { error: 'Missing topic or id' },
        { status: 400 }
      );
    }

    // Signature verification (required in production)
    const sig = verifyMercadoPagoSignature(request, id, MP_WEBHOOK_SECRET);
    if (!sig.ok) {
      console.warn(`[MP Webhook] Invalid signature: ${sig.reason}`);
      if (MP_IS_PRODUCTION) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      }
    }

    const validTopic = validateWebhookTopic(topic);
    if (!validTopic) {
      console.warn(`[MP Webhook] Unknown topic: ${topic}`);
      return NextResponse.json({ received: true });
    }

    addBreadcrumb('Mercado Pago webhook received', { topic, id });

    await logPaymentEvent({
      eventType: PaymentEventType.WEBHOOK_RECEIVED,
      metadata: { topic, mpId: id },
    });

    switch (validTopic) {
      case 'payment':
        await handlePaymentNotification(id);
        break;
      case 'merchant_order':
        await handleMerchantOrderNotification(id);
        break;
      case 'preapproval':
        await handlePreApprovalNotification(id);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/webhook',
    });
    console.error('[MP Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 200 } // MP expects 200 even on errors
    );
  }
}

async function handlePaymentNotification(paymentId: string) {
  try {
    const mpPayment = await getPayment(paymentId);

    if (!mpPayment) {
      console.warn(`[MP Webhook] Payment not found: ${paymentId}`);
      return;
    }

    const externalReference = mpPayment.external_reference;
    const mpStatus = mpPayment.status;
    const mappedStatus = mapMPStatusToPaymentStatus(mpStatus);
    const paymentType = mapMPPaymentType(mpPayment.payment_type_id);

    // Find our payment record
    let payment = null;
    if (externalReference) {
      payment = await prisma.payment.findUnique({
        where: { id: externalReference },
        include: { mercadoPagoData: true },
      });
    }

    // Fallback: search by mpPaymentId
    if (!payment && mpPayment.id) {
      const mpTransaction = await prisma.mercadoPagoTransaction.findFirst({
        where: { mpPaymentId: String(mpPayment.id) },
        include: { payment: true },
      });
      payment = mpTransaction?.payment;
    }

    if (!payment) {
      console.warn(`[MP Webhook] No payment record found for: ${externalReference || paymentId}`);
      return;
    }

    // Update payment
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: mappedStatus,
        processedAt: ['APPROVED', 'SETTLED'].includes(mappedStatus) ? new Date() : undefined,
        gatewayFee: mpPayment.fee_details?.reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0) || 0,
        netAmount: (Number(payment.amount) - (mpPayment.fee_details?.reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0) || 0)),
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          mpPaymentId: mpPayment.id,
          mpStatus,
          mpStatusDetail: mpPayment.status_detail,
          paymentType,
          installments: mpPayment.installments,
          installmentRate: mpPayment.installment_rate,
          transactionDetails: mpPayment.transaction_details,
          feeDetails: mpPayment.fee_details,
          payerId: mpPayment.payer?.id,
        }),
      },
    });

    // Update MercadoPagoTransaction
    await prisma.mercadoPagoTransaction.updateMany({
      where: { paymentId: payment.id },
      data: {
        mpPaymentId: String(mpPayment.id),
        mpStatus,
        mpStatusDetail: mpPayment.status_detail,
        paymentType,
        installments: mpPayment.installments || 1,
        installmentRate: mpPayment.installment_rate ? String(mpPayment.installment_rate) : null,
        payerEmail: mpPayment.payer?.email,
        payerDocType: mpPayment.payer?.identification?.type,
        payerDocNumber: mpPayment.payer?.identification?.number,
        lastWebhookAt: new Date(),
        webhookPayload: JSON.stringify(mpPayment),
      },
    });

    // Log event
    const eventType = mappedStatus === 'APPROVED'
      ? PaymentEventType.PAYMENT_INTENT_SUCCEEDED
      : mappedStatus === 'DECLINED'
      ? PaymentEventType.PAYMENT_INTENT_FAILED
      : PaymentEventType.WEBHOOK_PROCESSED;

    await logPaymentEvent({
      eventType,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: mappedStatus,
      metadata: { mpPaymentId: mpPayment.id, mpStatus, paymentType },
    });

    // Handle subscription link
    if (payment.subscriptionId && mappedStatus === 'APPROVED') {
      await prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'active',
        },
      });
    }

    // Create BillingInvoice when payment is approved (idempotent by MP payment id)
    if (mappedStatus === 'APPROVED') {
      try {
        const { createInvoice } = await import('@/lib/billing/invoice-service');
        const mpPaymentIdStr = String(mpPayment.id);
        const existing = await prisma.billingInvoice.findFirst({
          where: {
            OR: [
              { paymentId: mpPaymentIdStr },
              { metadata: { contains: `"mpPaymentId":"${mpPaymentIdStr}"` } },
              { metadata: { contains: `"mpPaymentId":${mpPaymentIdStr}` } },
            ],
          },
          select: { id: true },
        });
        if (existing) {
          console.log(`[MP Webhook] BillingInvoice already exists for MP payment ${mpPaymentIdStr}`);
        } else {
          const userRec = payment.userId
            ? await prisma.user.findUnique({
                where: { id: payment.userId },
                select: { id: true, name: true, email: true },
              })
            : null;
          const restId = payment.restaurantId || null;
          const customerEmail =
            mpPayment.payer?.email || userRec?.email || '';
          const customerName =
            (mpPayment.payer?.first_name && mpPayment.payer?.last_name
              ? `${mpPayment.payer.first_name} ${mpPayment.payer.last_name}`
              : mpPayment.payer?.first_name) ||
            userRec?.name ||
            customerEmail ||
            'Cliente';
          const description =
            payment.description ||
            (payment.subscriptionId
              ? 'Assinatura — pagamento via Mercado Pago'
              : 'Pagamento via Mercado Pago');
          const amount = Number(payment.amount) || 0;
          await createInvoice({
            userId: userRec?.id || null,
            restaurantId: restId,
            customerName,
            customerEmail,
            subscriptionId: payment.subscriptionId || null,
            description,
            subtotal: amount,
            tax: 0,
            discount: 0,
            total: amount,
            currency: payment.currency || 'BRL',
            status: 'PAID',
            paidAt: new Date(),
            paymentMethod: 'mercadopago',
            paymentId: mpPaymentIdStr,
          });
          await prisma.billingInvoice.updateMany({
            where: { paymentId: mpPaymentIdStr },
            data: {
              metadata: JSON.stringify({
                mpPaymentId: mpPaymentIdStr,
                mpStatus: mpStatus,
                paymentType,
              }),
            },
          });
        }
      } catch (invErr) {
        console.error('[MP Webhook] BillingInvoice creation failed (non-fatal):', invErr);
      }
    }

    // -------- Real-time Alerts --------
    try {
      const amountNum = Number(payment.amount);
      if (mappedStatus === 'APPROVED') {
        await createPaymentAlert({
          alertType: 'approved',
          severity: 'low',
          title: 'Pagamento Aprovado',
          message: `Pagamento ${paymentType || 'MP'} de R$ ${amountNum.toFixed(2)} aprovado.`,
          paymentId: payment.id,
          gateway: 'MERCADO_PAGO',
          amount: amountNum,
          restaurantId: payment.restaurantId ?? null,
        });
      } else if (mappedStatus === 'DECLINED') {
        await createPaymentAlert({
          alertType: 'failure',
          severity: 'high',
          title: 'Falha no Pagamento (Mercado Pago)',
          message: `Pagamento recusado. Motivo: ${mpPayment.status_detail || 'desconhecido'}.`,
          paymentId: payment.id,
          gateway: 'MERCADO_PAGO',
          amount: amountNum,
          restaurantId: payment.restaurantId ?? null,
        });
      } else if (mappedStatus === 'REFUNDED' || mappedStatus === 'PARTIALLY_REFUNDED') {
        await createPaymentAlert({
          alertType: 'refund',
          severity: 'medium',
          title: 'Reembolso Processado',
          message: `Reembolso de R$ ${amountNum.toFixed(2)} processado via Mercado Pago.`,
          paymentId: payment.id,
          gateway: 'MERCADO_PAGO',
          amount: amountNum,
          restaurantId: payment.restaurantId ?? null,
        });
      } else if (mappedStatus === 'CHARGEBACK') {
        await createPaymentAlert({
          alertType: 'chargeback',
          severity: 'critical',
          title: 'Chargeback Iniciado (Mercado Pago)',
          message: `Chargeback aberto no valor de R$ ${amountNum.toFixed(2)}. Ação necessária.`,
          paymentId: payment.id,
          gateway: 'MERCADO_PAGO',
          amount: amountNum,
          restaurantId: payment.restaurantId ?? null,
        });
      }
    } catch (alertErr) {
      console.warn('[MP Webhook] Alert publish error (non-fatal):', alertErr);
    }

    console.log(`[MP Webhook] Payment ${payment.id} updated to ${mappedStatus}`);
  } catch (error) {
    console.error(`[MP Webhook] Payment handling error for ${paymentId}:`, error);
    throw error;
  }
}

async function handleMerchantOrderNotification(orderId: string) {
  try {
    const order = await getMerchantOrder(orderId);
    console.log(`[MP Webhook] Merchant order ${orderId} processed`, {
      status: order.status,
      externalReference: order.external_reference,
    });
  } catch (error) {
    console.error(`[MP Webhook] Merchant order error for ${orderId}:`, error);
    throw error;
  }
}

async function handlePreApprovalNotification(preApprovalId: string) {
  try {
    const preApproval = await getPreApproval(preApprovalId);
    console.log(`[MP Webhook] PreApproval ${preApprovalId} processed`, {
      status: preApproval.status,
      externalReference: preApproval.external_reference,
    });

    // Update subscription if linked
    if (preApproval.external_reference) {
      const subscription = await prisma.subscription.findFirst({
        where: { gatewaySubscriptionId: preApprovalId },
      });
      if (subscription) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: preApproval.status === 'authorized' ? 'active' : 'cancelled',
          },
        });
      }
    }
  } catch (error) {
    console.error(`[MP Webhook] PreApproval error for ${preApprovalId}:`, error);
    throw error;
  }
}
