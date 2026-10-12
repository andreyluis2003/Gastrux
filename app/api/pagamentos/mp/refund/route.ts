// @ts-nocheck
/**
 * Mercado Pago Refund API
 * POST /api/pagamentos/mp/refund
 *
 * Refunds a Mercado Pago payment (full or partial)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantManager } from '@/lib/mercadopago-connect/guard';
import { refundPayment } from '@/lib/mercado-pago';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { refundConnectPayment } from '@/lib/mercadopago-connect/payments';
import { recordGatewayRefund, refundAlreadyDone } from '@/lib/payments/refund-record';
import { captureException, trackApiCall } from '@/lib/sentry';
import { REFUNDABLE_GATEWAYS, REFUNDABLE_STATUSES } from '@/lib/payments/refund-eligibility';
import { MP_FAILED_STATUS } from '@/lib/mercadopago-connect/http-status';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Authorized by membership in the CURRENT restaurant (its owner, or an active
    // OWNER/ADMIN/MANAGER member), never by the global JWT role: a user who is
    // OWNER of restaurant X and only a cashier of this one must not refund here.
    const auth = await requireRestaurantManager(
      ['OWNER', 'ADMIN', 'MANAGER'],
      'Apenas o dono, administrador ou gerente pode reembolsar pagamentos'
    );
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { session, restaurantId } = auth;

    const { paymentId, amount, reason, description } = await request.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // A provided amount must be a positive number: 0 or garbage must never fall through to a full refund.
    if (amount !== undefined && amount !== null && amount !== '') {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ error: 'Valor de reembolso inválido' }, { status: 400 });
      }
    }

    // The payment must belong to the current restaurant (the one the caller was
    // just authorized for) - otherwise a manager could refund another restaurant's payment.

    // Find the payment
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, restaurantId },
      include: { mercadoPagoData: true, refunds: true },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    if (!(REFUNDABLE_GATEWAYS as readonly string[]).includes(payment.gateway)) {
      return NextResponse.json({ error: 'Só pagamentos do Mercado Pago podem ser estornados por aqui' }, { status: 400 });
    }

    if (payment.status === 'REFUNDED') {
      return NextResponse.json({ error: 'Este pagamento já foi estornado.' }, { status: 400 });
    }
    if (!(REFUNDABLE_STATUSES as readonly string[]).includes(payment.status)) {
      return NextResponse.json(
        { error: 'Este pagamento não pode ser estornado (só pagamentos aprovados)' },
        { status: 400 }
      );
    }

    const totalRefunded = payment.refunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const remainingAmount = Number(payment.amount) - totalRefunded;

    // Cents compared, so 0.1 + 0.2 style float residue never blocks refunding exactly what is left.
    if (amount && Math.round(Number(amount) * 100) > Math.round(remainingAmount * 100)) {
      return NextResponse.json(
        { error: `O valor passa do que ainda pode ser estornado (R$ ${remainingAmount.toFixed(2).replace('.', ',')})` },
        { status: 400 }
      );
    }

    const refundAmount = amount ? Number(amount) : remainingAmount;

    // Nothing left to refund. Without this guard a third call after a full
    // refund computed refundAmount = 0 and reached refundConnectPayment /
    // refundPayment with an undefined amount, which is a FULL refund request
    // against the restaurant's account. Mirrors lib/payment-unified.ts.
    if (!(refundAmount > 0)) {
      return NextResponse.json({ error: 'Nada a reembolsar' }, { status: 400 });
    }

    // An identical repeated request (double click, client retry after a
    // timeout) maps to the SAME key, so Mercado Pago refunds only once.
    const idempotencyKey = `refund:${payment.id}:${totalRefunded}:${refundAmount}`;

    // Get MP payment ID. Payments received by a restaurant through its own
    // Mercado Pago account (MERCADO_PAGO_CONNECT) keep it in gatewayPaymentId.
    const isConnect = payment.gateway === 'MERCADO_PAGO_CONNECT';
    const mpPaymentId = isConnect ? payment.gatewayPaymentId : payment.mercadoPagoData?.mpPaymentId;
    if (!mpPaymentId) {
      return NextResponse.json(
        { error: 'Este pagamento não tem o número do Mercado Pago, então não pode ser estornado por aqui' },
        { status: 400 }
      );
    }

    // Process refund via MP API - with the restaurant's own token for Connect payments.
    let mpRefund;
    let client: Awaited<ReturnType<typeof getMpClientForRestaurant>> = null;
    try {
      if (isConnect) {
        client = await getMpClientForRestaurant(restaurantId);
        if (!client) {
          return NextResponse.json(
            { error: 'Conexão com o Mercado Pago indisponível. Reconecte sua conta para reembolsar.' },
            { status: 409 }
          );
        }
        mpRefund = await refundConnectPayment(
          client,
          mpPaymentId,
          amount ? Number(amount) : undefined,
          idempotencyKey
        );
      } else {
        mpRefund = await refundPayment(mpPaymentId, amount ? Number(amount) : undefined);
      }
    } catch (mpError) {
      // An error is not proof that nothing was refunded (prod 2026-10-12: the refund happened and only the
      // answer failed). Ask Mercado Pago: if what was asked is refunded there, it is recorded as done.
      const done = isConnect && client ? await refundAlreadyDone(client, mpPaymentId, totalRefunded + refundAmount) : null;
      if (!done) {
        // Mercado Pago said no (e.g. not enough balance, payment too old): the owner must see why.
        // Nothing was written, so retrying later is safe.
        const e = mpError as any;
        const detail = e?.cause?.[0]?.description || e?.message;
        console.error('[MP Refund] Mercado Pago refused the refund:', mpError);
        return NextResponse.json(
          { error: `O Mercado Pago não fez o estorno${detail ? `: ${detail}` : ''}. Nada foi alterado.` },
          { status: MP_FAILED_STATUS }
        );
      }
      console.error('[MP Refund] Mercado Pago answered with an error but the refund is done there; recording it:', mpError);
      mpRefund = { id: done.refundId };
    }

    // Recorded once, also when the Mercado Pago notice of this same refund arrives first or later
    const recorded = await recordGatewayRefund({
      paymentId: payment.id,
      refundedTotal: totalRefunded + refundAmount,
      gatewayRefundId: mpRefund?.id != null ? String(mpRefund.id) : null,
      processedById: session.user.id,
      reason: reason || 'requested_by_customer',
      description: description || `Refund for payment ${payment.id}`,
    });
    const newStatus = recorded.status;
    const refund = { id: recorded.refundId };

    // A fully refunded payment must not leave its order showing as paid in the
    // KDS/POS. Idempotent and restaurantId-scoped, and only from APPROVED; a
    // PARTIAL refund keeps the order APPROVED.
    if (newStatus === 'REFUNDED' && payment.orderId) {
      await prisma.order.updateMany({
        where: { id: payment.orderId, restaurantId, paymentStatus: 'APPROVED' },
        data: { paymentStatus: 'REFUNDED' },
      });
    }

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/refund', 200, duration);

    return NextResponse.json({
      refundId: refund.id,
      paymentId: payment.id,
      amount: refundAmount,
      status: newStatus,
      gatewayRefundId: mpRefund.id,
      remainingBalance: Number(payment.amount) - totalRefunded - refundAmount,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/refund', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/refund',
    });
    console.error('[MP Refund] Error:', error);
    return NextResponse.json(
      { error: 'Não foi possível concluir o estorno. Confira no Mercado Pago antes de tentar de novo.' },
      { status: 500 }
    );
  }
}
