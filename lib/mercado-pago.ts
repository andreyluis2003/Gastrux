// @ts-nocheck
/**
 * ============================================================
 * FASE 44 - Mercado Pago SDK Integration (Oficial)
 * ============================================================
 * SDK npm: https://www.npmjs.com/package/mercadopago
 * Docs: https://www.mercadopago.com.br/developers/pt/reference
 *
 * Módulos:
 * - Preference (checkout)
 * - Payment (consulta de pagamento)
 * - PreApproval (assinaturas)
 * - MerchantOrder (ordens)
 * - Point (maquininha)
 */

import { MercadoPagoConfig, Preference, Payment, PreApproval, MerchantOrder } from 'mercadopago';

/**
 * Environment-aware Mercado Pago credential selection.
 *
 * When MERCADO_PAGO_ENV=production, the production credentials are used.
 * Otherwise the test credentials are used (default: test).
 *
 * Production credentials must be configured separately in .env:
 *   - MERCADO_PAGO_ACCESS_TOKEN_PROD
 *   - NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY_PROD
 *   - MERCADO_PAGO_WEBHOOK_SECRET
 */
const MP_ENV = process.env.MERCADO_PAGO_ENV || 'test';
const IS_PROD = MP_ENV === 'production';

const MP_ACCESS_TOKEN = IS_PROD
  ? (process.env.MERCADO_PAGO_ACCESS_TOKEN_PROD || process.env.MERCADO_PAGO_ACCESS_TOKEN)
  : process.env.MERCADO_PAGO_ACCESS_TOKEN;

const MP_PUBLIC_KEY = IS_PROD
  ? (process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY_PROD || process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY)
  : process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

export const MP_WEBHOOK_SECRET = IS_PROD
  ? (process.env.MERCADO_PAGO_WEBHOOK_SECRET_PROD || process.env.MERCADO_PAGO_WEBHOOK_SECRET || '')
  : (process.env.MERCADO_PAGO_WEBHOOK_SECRET || '');
export const MP_IS_PRODUCTION = IS_PROD;

let mpClient: MercadoPagoConfig | null = null;

export function getMercadoPagoClient(): MercadoPagoConfig {
  if (!mpClient) {
    if (!MP_ACCESS_TOKEN) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN not configured');
    }
    mpClient = new MercadoPagoConfig({
      accessToken: MP_ACCESS_TOKEN,
      options: {
        timeout: 5000,
        idempotencyKey: generateIdempotencyKey(),
      },
    });
  }
  return mpClient;
}

export function isMercadoPagoConfigured(): boolean {
  return !!MP_ACCESS_TOKEN && !!MP_PUBLIC_KEY;
}

// ============================================================
// CHECKOUT PREFERENCE
// ============================================================

export interface CreatePreferenceInput {
  orderId: string;
  items: Array<{
    id: string;
    title: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    currencyId?: string;
    pictureUrl?: string;
    categoryId?: string;
  }>;
  payer: {
    email: string;
    name?: string;
    phone?: string;
    document?: { type: string; number: string };
    address?: {
      zipCode?: string;
      streetName?: string;
      streetNumber?: string;
    };
  };
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl: string;
  externalReference: string;
  autoReturn?: 'approved' | 'all';
  expires?: boolean;
  expirationDateFrom?: string;
  expirationDateTo?: string;
  statementDescriptor?: string;
}

export async function createCheckoutPreference(input: CreatePreferenceInput) {
  const client = getMercadoPagoClient();

  const preference = new Preference(client);

  const body = {
    items: input.items.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      currency_id: item.currencyId || 'BRL',
      picture_url: item.pictureUrl,
      category_id: item.categoryId,
    })),
    payer: {
      email: input.payer.email,
      name: input.payer.name,
      phone: input.payer.phone ? { number: input.payer.phone } : undefined,
      identification: input.payer.document || undefined,
      address: input.payer.address || undefined,
    },
    back_urls: input.backUrls,
    notification_url: input.notificationUrl,
    external_reference: input.externalReference,
    auto_return: input.autoReturn || 'approved',
    expires: input.expires ?? false,
    expiration_date_from: input.expirationDateFrom,
    expiration_date_to: input.expirationDateTo,
    statement_descriptor: input.statementDescriptor,
    payment_methods: {
      excluded_payment_methods: [],
      excluded_payment_types: [],
      installments: 12,
      default_payment_method_id: null,
      default_installments: 1,
    },
  };

  return preference.create({ body });
}

// ============================================================
// PAYMENT LOOKUP
// ============================================================

export async function getPayment(paymentId: string) {
  const client = getMercadoPagoClient();
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

export async function searchPaymentsByExternalReference(reference: string) {
  const client = getMercadoPagoClient();
  const payment = new Payment(client);
  return payment.search({
    options: {
      external_reference: reference,
    },
  });
}

// ============================================================
// PAYMENT REFUND
// ============================================================

export async function refundPayment(paymentId: string, amount?: number) {
  const client = getMercadoPagoClient();
  const payment = new Payment(client);
  const body: any = {};
  if (amount) body.amount = amount;
  return payment.cancel({ id: paymentId, body });
}

// ============================================================
// MERCHANT ORDER (consulta por collection_id)
// ============================================================

export async function getMerchantOrder(orderId: string) {
  const client = getMercadoPagoClient();
  const merchantOrder = new MerchantOrder(client);
  return merchantOrder.get({ merchantOrderId: orderId });
}

// ============================================================
// PRE-APPROVAL (ASSINATURAS / RECORRENCIA)
// ============================================================

export interface CreatePreApprovalInput {
  payerEmail: string;
  backUrl: string;
  reason: string;
  externalReference: string;
  autoRecurring: {
    frequency: number;
    frequencyType: 'days' | 'months';
    transactionAmount: number;
    currencyId?: string;
    startDate?: string;
    endDate?: string;
    billingDay?: number;
    billingDayProportional?: boolean;
    freeTrial?: {
      frequency: number;
      frequencyType: 'days' | 'months';
    };
  };
  cardTokenId?: string;
}

export async function createPreApproval(input: CreatePreApprovalInput) {
  const client = getMercadoPagoClient();
  const preApproval = new PreApproval(client);

  const body = {
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    reason: input.reason,
    external_reference: input.externalReference,
    auto_recurring: {
      frequency: input.autoRecurring.frequency,
      frequency_type: input.autoRecurring.frequencyType,
      transaction_amount: input.autoRecurring.transactionAmount,
      currency_id: input.autoRecurring.currencyId || 'BRL',
      start_date: input.autoRecurring.startDate,
      end_date: input.autoRecurring.endDate,
      billing_day: input.autoRecurring.billingDay,
      billing_day_proportional: input.autoRecurring.billingDayProportional,
      free_trial: input.autoRecurring.freeTrial,
    },
    card_token_id: input.cardTokenId,
  };

  return preApproval.create({ body });
}

export async function getPreApproval(preApprovalId: string) {
  const client = getMercadoPagoClient();
  const preApproval = new PreApproval(client);
  return preApproval.get({ id: preApprovalId });
}

export async function updatePreApproval(preApprovalId: string, status: 'paused' | 'cancelled') {
  const client = getMercadoPagoClient();
  const preApproval = new PreApproval(client);
  return preApproval.update({
    id: preApprovalId,
    body: { status },
  });
}

/**
 * Maps Mercado Pago's PreApproval status to our normalized subscription
 * vocabulary (see lib/billing/subscription-sync.ts). MP has no native
 * "trialing" status - the sync helper derives that separately from
 * trialEnd, so `authorized` maps straight to `active` here regardless of
 * whether the subscription is currently inside its free trial period.
 */
export function mapMPPreApprovalStatus(
  mpStatus: string
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' {
  switch (mpStatus) {
    case 'authorized':
      return 'active';
    case 'paused':
      return 'past_due';
    case 'cancelled':
      return 'canceled';
    case 'pending':
    default:
      return 'incomplete';
  }
}

/**
 * MP's PreApproval only accepts frequency_type 'days' or 'months' (no
 * 'years') - annual billing is expressed as 12 months.
 */
export function getMPAutoRecurringForBillingCycle(
  billingCycle: 'monthly' | 'annual'
): { frequency: number; frequencyType: 'months' } {
  return billingCycle === 'annual'
    ? { frequency: 12, frequencyType: 'months' }
    : { frequency: 1, frequencyType: 'months' };
}

// ============================================================
// PIX (via Preference + external_reference tracking)
// ============================================================

export async function createPixPreference(input: Omit<CreatePreferenceInput, 'items'> & { amount: number; description: string }) {
  return createCheckoutPreference({
    ...input,
    items: [{
      id: 'pix-payment',
      title: input.description,
      quantity: 1,
      unitPrice: input.amount,
    }],
  });
}

// ============================================================
// STATUS MAPPING
// ============================================================

export function mapMPStatusToPaymentStatus(mpStatus: string): string {
  const map: Record<string, string> = {
    approved: 'APPROVED',
    pending: 'PENDING',
    authorized: 'PROCESSING',
    in_process: 'PROCESSING',
    in_mediation: 'PROCESSING',
    rejected: 'DECLINED',
    cancelled: 'CANCELLED',
    refunded: 'REFUNDED',
    charged_back: 'CHARGEBACK',
  };
  return map[mpStatus] || 'PENDING';
}

export function mapMPPaymentType(type: string): string {
  const map: Record<string, string> = {
    account_money: 'wallet',
    ticket: 'boleto',
    bank_transfer: 'bank_transfer',
    atm: 'atm',
    credit_card: 'credit_card',
    debit_card: 'debit_card',
    prepaid_card: 'prepaid_card',
    digital_currency: 'crypto',
    digital_wallet: 'wallet',
    voucher_card: 'voucher',
    crypto_transfer: 'crypto',
    point: 'point',
  };
  return map[type] || 'other';
}

// ============================================================
// WEBHOOK / IPN
// ============================================================

export type MPWebhookTopic = 'payment' | 'merchant_order' | 'preapproval';

/**
 * Normalizes a webhook topic/type to our three handled values.
 *
 * Besides the legacy IPN topics (payment, merchant_order, preapproval), MP's
 * newer Webhooks v2 format sends subscription events under their own longer
 * type names - subscription_authorized_payment for each recurring PreApproval
 * charge, and subscription_preapproval for PreApproval status changes. These
 * were previously falling through unrecognized and silently dropped (200 OK,
 * no processing), meaning recurring subscription charges never reached
 * handleSubscriptionRecurringCharge and PreApproval status changes never
 * synced. Both map onto the existing 'payment'/'preapproval' handlers, which
 * already fetch the full resource by id rather than trusting the webhook body.
 */
export function validateWebhookTopic(topic: string): MPWebhookTopic | null {
  const aliases: Record<string, MPWebhookTopic> = {
    payment: 'payment',
    subscription_authorized_payment: 'payment',
    merchant_order: 'merchant_order',
    preapproval: 'preapproval',
    subscription_preapproval: 'preapproval',
  };
  return aliases[topic] || null;
}

// ============================================================
// UTILITIES
// ============================================================

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function getMPPublicKey(): string {
  if (!MP_PUBLIC_KEY) throw new Error('NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY not configured');
  return MP_PUBLIC_KEY;
}

export { MercadoPagoConfig, Preference, Payment, PreApproval, MerchantOrder };
