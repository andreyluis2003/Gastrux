// @ts-nocheck
/**
 * ============================================================
 * FASE 44 - Stripe Connect Integration
 * ============================================================
 * Express Account onboarding + transfers + payouts
 * Docs: https://stripe.com/docs/connect/express-accounts
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID;

if (!STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY not configured');
}

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
});

export function isStripeConnectConfigured(): boolean {
  return !!STRIPE_SECRET_KEY && !!STRIPE_CONNECT_CLIENT_ID;
}

// ============================================================
// EXPRESS ACCOUNT ONBOARDING
// ============================================================

export interface CreateExpressAccountInput {
  email: string;
  restaurantName: string;
  country?: string;
  businessType?: 'individual' | 'company';
  restaurantId: string;
}

export async function createExpressAccount(input: CreateExpressAccountInput) {
  const account = await stripe.accounts.create({
    type: 'express',
    country: input.country || 'BR',
    email: input.email,
    business_type: input.businessType || 'company',
    business_profile: {
      name: input.restaurantName,
      url: undefined,
      product_description: 'Restaurant management platform services',
    },
    metadata: {
      restaurantId: input.restaurantId,
      source: 'restaurante-app',
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      pix_payments: { requested: true },
    },
    settings: {
      payouts: {
        schedule: {
          interval: 'daily',
        },
      },
    },
  });

  return account;
}

export async function createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
    collect: 'eventually_due',
  });

  return accountLink;
}

export async function getAccount(accountId: string) {
  return stripe.accounts.retrieve(accountId);
}

export async function updateAccount(accountId: string, updates: Partial<Stripe.AccountUpdateParams>) {
  return stripe.accounts.update(accountId, updates);
}

// ============================================================
// PAYMENT INTENTS (on behalf of connected account)
// ============================================================

export interface CreatePaymentIntentInput {
  amount: number; // in cents
  currency: string;
  connectedAccountId: string;
  applicationFeeAmount?: number; // in cents
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
  paymentMethodTypes?: string[];
  receiptEmail?: string;
  automaticPaymentMethods?: { enabled: boolean; allow_redirects?: 'never' };
  setupFutureUsage?: 'on_session' | 'off_session';
}

export async function createPaymentIntent(input: CreatePaymentIntentInput) {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: input.amount,
    currency: input.currency || 'brl',
    application_fee_amount: input.applicationFeeAmount,
    customer: input.customerId,
    description: input.description,
    metadata: input.metadata,
    payment_method_types: input.paymentMethodTypes || ['card', 'pix'],
    receipt_email: input.receiptEmail,
    automatic_payment_methods: input.automaticPaymentMethods || { enabled: true },
    setup_future_usage: input.setupFutureUsage,
    transfer_data: {
      destination: input.connectedAccountId,
    },
  };

  return stripe.paymentIntents.create(params, {
    stripeAccount: input.connectedAccountId,
  });
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function confirmPaymentIntent(paymentIntentId: string, paymentMethodId?: string) {
  return stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
  });
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.cancel(paymentIntentId);
}

// ============================================================
// REFUNDS
// ============================================================

export async function createRefund(chargeId: string, amount?: number, reason?: Stripe.RefundCreateParams.Reason) {
  const params: Stripe.RefundCreateParams = {
    charge: chargeId,
    reason,
  };
  if (amount) params.amount = amount;

  return stripe.refunds.create(params);
}

// ============================================================
// CUSTOMERS (for connected accounts)
// ============================================================

export async function createCustomer(
  connectedAccountId: string,
  input: { email: string; name?: string; phone?: string; metadata?: Record<string, string> }
) {
  return stripe.customers.create(
    {
      email: input.email,
      name: input.name,
      phone: input.phone,
      metadata: input.metadata,
    },
    { stripeAccount: connectedAccountId }
  );
}

// ============================================================
// TRANSFERS & PAYOUTS
// ============================================================

export async function createTransfer(
  connectedAccountId: string,
  amount: number,
  currency: string,
  description?: string
) {
  return stripe.transfers.create({
    amount,
    currency,
    destination: connectedAccountId,
    description,
  });
}

export async function listTransfers(connectedAccountId: string, limit: number = 10) {
  return stripe.transfers.list(
    { limit, destination: connectedAccountId },
    { stripeAccount: connectedAccountId }
  );
}

export async function listPayouts(connectedAccountId: string, limit: number = 10) {
  return stripe.payouts.list({ limit }, { stripeAccount: connectedAccountId });
}

export async function getBalance(connectedAccountId: string) {
  return stripe.balance.retrieve({ stripeAccount: connectedAccountId });
}

// ============================================================
// CONNECT ONBOARDING URL (OAuth flow)
// ============================================================

export function generateConnectOAuthUrl(
  state: string,
  redirectUri: string,
  suggestedCapabilities?: string[]
): string {
  if (!STRIPE_CONNECT_CLIENT_ID) {
    throw new Error('STRIPE_CONNECT_CLIENT_ID not configured');
  }

  const params = new URLSearchParams({
    client_id: STRIPE_CONNECT_CLIENT_ID,
    response_type: 'code',
    scope: 'read_write',
    redirect_uri: redirectUri,
    state,
  });

  if (suggestedCapabilities) {
    params.set('suggested_capabilities', suggestedCapabilities.join(','));
  }

  return `https://connect.stripe.com/express/oauth/authorize?${params.toString()}`;
}

export async function completeOAuthFlow(code: string, grantType: 'authorization_code') {
  const response = await stripe.oauth.token({
    grant_type: grantType,
    code,
  });

  return response;
}

// ============================================================
// STATUS MAPPING
// ============================================================

export function mapStripePaymentStatus(status: string): string {
  const map: Record<string, string> = {
    requires_payment_method: 'PENDING',
    requires_confirmation: 'PROCESSING',
    requires_action: 'PROCESSING',
    processing: 'PROCESSING',
    requires_capture: 'PROCESSING',
    canceled: 'CANCELLED',
    succeeded: 'APPROVED',
  };
  return map[status] || 'PENDING';
}

export function mapStripeRefundStatus(status: string): string {
  const map: Record<string, string> = {
    pending: 'pending',
    requires_action: 'pending',
    succeeded: 'completed',
    failed: 'failed',
    canceled: 'failed',
  };
  return map[status] || 'pending';
}

// ============================================================
// WEBHOOK SECRET (per account)
// ============================================================

export async function getWebhookSecret(): Promise<string | undefined> {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

export function constructEvent(payload: string, signature: string, secret: string) {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

export { Stripe };
