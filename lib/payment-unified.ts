// @ts-nocheck
/**
 * ============================================================
 * FASE 44 - Unified Payment Service
 * ============================================================
 * Abstraction layer over multiple payment gateways
 * Provides consistent API for all payment operations
 *
 * Supported Gateways:
 * - MERCADO_PAGO (Brazil primary)
 * - STRIPE / STRIPE_CONNECT (International + larger clients)
 * - MANUAL (cash, bank transfer)
 */

import { prisma } from './prisma';
import { isMercadoPagoConfigured, createCheckoutPreference, getPayment as getMPPayment } from './mercado-pago';
import { isStripeConnectConfigured, createPaymentIntent, retrievePaymentIntent, createRefund as createStripeRefund } from './stripe-connect';
import { logPaymentEvent, PaymentEventType } from './payment-logger';
import { captureException } from './sentry';

export type UnifiedGateway = 'MERCADO_PAGO' | 'STRIPE_CONNECT' | 'MANUAL';

export interface CreatePaymentInput {
  restaurantId: string;
  gateway: UnifiedGateway;
  amount: number;
  currency?: string;
  description?: string;
  items: Array<{
    id: string;
    title: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    pictureUrl?: string;
  }>;
  customer: {
    email: string;
    name?: string;
    phone?: string;
    document?: { type: string; number: string };
  };
  metadata?: Record<string, any>;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  webhookUrl: string;
  externalReference?: string;
  applicationFeePercent?: number;
}

export interface PaymentResult {
  paymentId: string;
  gatewayPaymentId: string;
  status: string;
  amount: number;
  currency: string;
  checkoutUrl?: string;
  clientSecret?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  expiresAt?: Date;
}

// ============================================================
// CREATE PAYMENT (Unified)
// ============================================================

export async function createUnifiedPayment(input: CreatePaymentInput): Promise<PaymentResult> {
  const totalAmount = input.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  // Validate gateway configuration
  if (input.gateway === 'MERCADO_PAGO' && !isMercadoPagoConfigured()) {
    throw new Error('Mercado Pago not configured');
  }
  if (input.gateway === 'STRIPE_CONNECT' && !isStripeConnectConfigured()) {
    throw new Error('Stripe Connect not configured');
  }

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      restaurantId: input.restaurantId,
      gateway: input.gateway,
      amount: totalAmount,
      currency: input.currency || 'BRL',
      method: input.gateway === 'STRIPE_CONNECT' ? 'STRIPE' : 'MERCADO_PAGO',
      status: 'PENDING',
      description: input.description || `Payment #${input.externalReference}`,
      customerEmail: input.customer.email,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      customerDocument: input.customer.document?.number,
      metadata: JSON.stringify({
        items: input.items,
        ...input.metadata,
      }),
    },
  });

  try {
    let result: PaymentResult;

    switch (input.gateway) {
      case 'MERCADO_PAGO':
        result = await processMercadoPagoPayment(payment.id, input, totalAmount);
        break;
      case 'STRIPE_CONNECT':
        result = await processStripeConnectPayment(payment.id, input, totalAmount);
        break;
      case 'MANUAL':
        result = {
          paymentId: payment.id,
          gatewayPaymentId: payment.id,
          status: 'PENDING',
          amount: totalAmount,
          currency: input.currency || 'BRL',
        };
        break;
      default:
        throw new Error(`Unsupported gateway: ${input.gateway}`);
    }

    // Update payment with gateway details
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId: result.gatewayPaymentId,
        netAmount: totalAmount - (payment.platformFee || 0) - (payment.gatewayFee || 0),
      },
    });

    await logPaymentEvent({
      eventType: PaymentEventType.CHECKOUT_SESSION_CREATED,
      amount: totalAmount,
      currency: input.currency || 'BRL',
      metadata: { gateway: input.gateway, paymentId: payment.id },
    });

    return result;
  } catch (error) {
    // Rollback on error
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'DECLINED' },
    });
    throw error;
  }
}

async function processMercadoPagoPayment(
  paymentId: string,
  input: CreatePaymentInput,
  totalAmount: number
): Promise<PaymentResult> {
  const preference = await createCheckoutPreference({
    orderId: paymentId,
    items: input.items,
    payer: input.customer,
    backUrls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    notificationUrl: input.webhookUrl,
    externalReference: paymentId,
    autoReturn: 'approved',
    statementDescriptor: input.description?.substring(0, 21),
  });

  // Create MercadoPagoTransaction record
  await prisma.mercadoPagoTransaction.create({
    data: {
      paymentId,
      preferenceId: preference.id,
      externalReference: paymentId,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    },
  });

  return {
    paymentId,
    gatewayPaymentId: preference.id,
    status: 'PENDING',
    amount: totalAmount,
    currency: input.currency || 'BRL',
    checkoutUrl: preference.init_point,
  };
}

async function processStripeConnectPayment(
  paymentId: string,
  input: CreatePaymentInput,
  totalAmount: number
): Promise<PaymentResult> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: input.restaurantId },
  });

  if (!restaurant?.stripeAccountId) {
    throw new Error('Restaurant not connected to Stripe');
  }

  const amountInCents = Math.round(totalAmount * 100);
  const applicationFeePercent = input.applicationFeePercent || 2.9;
  const applicationFeeAmount = Math.round(amountInCents * (applicationFeePercent / 100));

  const paymentIntent = await createPaymentIntent({
    amount: amountInCents,
    currency: 'brl',
    connectedAccountId: restaurant.stripeAccountId,
    applicationFeeAmount,
    description: input.description,
    metadata: {
      paymentId,
      restaurantId: input.restaurantId,
      ...input.metadata,
    },
    receiptEmail: input.customer.email,
  });

  // Create StripeTransaction record
  await prisma.stripeTransaction.create({
    data: {
      paymentId,
      stripePaymentIntentId: paymentIntent.id,
      stripeStatus: paymentIntent.status,
      paymentMethodType: 'card',
    },
  });

  return {
    paymentId,
    gatewayPaymentId: paymentIntent.id,
    status: 'PENDING',
    amount: totalAmount,
    currency: input.currency || 'BRL',
    clientSecret: paymentIntent.client_secret || undefined,
  };
}

// ============================================================
// REFUND (Unified)
// ============================================================

export async function createUnifiedRefund(
  paymentId: string,
  amount?: number,
  reason?: string,
  processedById?: string
): Promise<{ refundId: string; status: string; amount: number }> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      mercadoPagoData: true,
      stripeData: true,
      refunds: { where: { status: 'completed' } },
    },
  });

  if (!payment) {
    throw new Error('Payment not found');
  }

  if (!['APPROVED', 'SETTLED'].includes(payment.status)) {
    throw new Error(`Cannot refund payment with status: ${payment.status}`);
  }

  const totalRefunded = payment.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Number(payment.amount) - totalRefunded;
  const refundAmount = amount ? Math.min(Number(amount), remaining) : remaining;

  if (refundAmount <= 0) {
    throw new Error('No remaining balance to refund');
  }

  let gatewayRefundId: string;

  switch (payment.gateway) {
    case 'MERCADO_PAGO': {
      const { refundPayment: mpRefund } = await import('./mercado-pago');
      const mpPaymentId = payment.mercadoPagoData?.mpPaymentId;
      if (!mpPaymentId) throw new Error('Mercado Pago payment ID not found');
      const result = await mpRefund(mpPaymentId, refundAmount);
      gatewayRefundId = String(result.id);
      break;
    }
    case 'STRIPE_CONNECT': {
      const chargeId = payment.stripeData?.stripeChargeId;
      if (!chargeId) throw new Error('Stripe charge ID not found');
      const result = await createStripeRefund(chargeId, Math.round(refundAmount * 100));
      gatewayRefundId = result.id;
      break;
    }
    case 'MANUAL':
      gatewayRefundId = `manual-${Date.now()}`;
      break;
    default:
      throw new Error(`Unsupported gateway: ${payment.gateway}`);
  }

  // Create refund record
  const refund = await prisma.paymentRefund.create({
    data: {
      paymentId,
      amount: refundAmount,
      currency: payment.currency,
      reason: reason || 'requested_by_customer',
      gateway: payment.gateway,
      gatewayRefundId,
      status: 'completed',
      description: `Unified refund for payment ${paymentId}`,
      processedById: processedById || null,
      completedAt: new Date(),
    },
  });

  // Update payment
  const newStatus = (totalRefunded + refundAmount) >= Number(payment.amount)
    ? 'REFUNDED'
    : 'PARTIALLY_REFUNDED';

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: newStatus,
      amountRefunded: totalRefunded + refundAmount,
      refundedAt: new Date(),
    },
  });

  return {
    refundId: refund.id,
    status: newStatus,
    amount: refundAmount,
  };
}

// ============================================================
// STATUS SYNC (Unified)
// ============================================================

export async function syncPaymentStatus(paymentId: string): Promise<string> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { mercadoPagoData: true, stripeData: true },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'APPROVED' || payment.status === 'SETTLED') {
    return payment.status;
  }

  let newStatus = payment.status;

  switch (payment.gateway) {
    case 'MERCADO_PAGO': {
      if (payment.mercadoPagoData?.mpPaymentId) {
        const mpPayment = await getMPPayment(payment.mercadoPagoData.mpPaymentId);
        const { mapMPStatusToPaymentStatus } = await import('./mercado-pago');
        newStatus = mapMPStatusToPaymentStatus(mpPayment.status || 'pending');
      }
      break;
    }
    case 'STRIPE_CONNECT': {
      if (payment.stripeData?.stripePaymentIntentId) {
        const pi = await retrievePaymentIntent(payment.stripeData.stripePaymentIntentId);
        const { mapStripePaymentStatus } = await import('./stripe-connect');
        newStatus = mapStripePaymentStatus(pi.status);
      }
      break;
    }
  }

  if (newStatus !== payment.status) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        processedAt: ['APPROVED', 'SETTLED'].includes(newStatus) ? new Date() : undefined,
      },
    });
  }

  return newStatus;
}

// ============================================================
// LIST PAYMENTS (Unified)
// ============================================================

export interface ListPaymentsFilters {
  restaurantId?: string;
  gateway?: UnifiedGateway;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
  customerEmail?: string;
  limit?: number;
  offset?: number;
}

export async function listPayments(filters: ListPaymentsFilters) {
  const where: any = {};

  if (filters.restaurantId) where.restaurantId = filters.restaurantId;
  if (filters.gateway) where.gateway = filters.gateway;
  if (filters.status) where.status = filters.status;
  if (filters.customerEmail) where.customerEmail = { contains: filters.customerEmail, mode: 'insensitive' };
  if (filters.fromDate || filters.toDate) {
    where.createdAt = {};
    if (filters.fromDate) where.createdAt.gte = filters.fromDate;
    if (filters.toDate) where.createdAt.lte = filters.toDate;
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        mercadoPagoData: true,
        stripeData: true,
        refunds: { where: { status: 'completed' } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, filters };
}

// ============================================================
// PAYMENT ANALYTICS
// ============================================================

export async function getPaymentAnalytics(restaurantId: string, fromDate?: Date, toDate?: Date) {
  const dateFilter: any = {};
  if (fromDate) dateFilter.gte = fromDate;
  if (toDate) dateFilter.lte = toDate;

  const where = {
    restaurantId,
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
  };

  const [
    totalRevenue,
    totalTransactions,
    byGateway,
    byStatus,
    averageAmount,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...where, status: { in: ['APPROVED', 'SETTLED'] } },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({
      by: ['gateway'],
      where: { ...where, status: { in: ['APPROVED', 'SETTLED'] } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.payment.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { ...where, status: { in: ['APPROVED', 'SETTLED'] } },
      _avg: { amount: true },
    }),
  ]);

  return {
    totalRevenue: totalRevenue._sum.amount || 0,
    totalTransactions,
    averageAmount: averageAmount._avg.amount || 0,
    byGateway: byGateway.map(g => ({
      gateway: g.gateway,
      amount: g._sum.amount || 0,
      count: g._count.id,
    })),
    byStatus: byStatus.map(s => ({
      status: s.status,
      count: s._count.id,
      amount: s._sum.amount || 0,
    })),
  };
}
