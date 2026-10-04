// @ts-nocheck
/**
 * Mercado Pago sends each event twice: a legacy IPN (?topic=&id=) that cannot be signature-verified,
 * and a signed Webhooks notification (?type=&data.id=). In production (2026-10-04) every IPN got 401
 * and was retried; only the signed one may be processed.
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'webhook-secret-test';
const syncRestaurantPayment = jest.fn();
const logPaymentEvent = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/mercado-pago', () => ({
  MP_WEBHOOK_SECRET: 'webhook-secret-test',
  validateWebhookTopic: (t: string) => (['payment', 'merchant_order', 'preapproval'].includes(t) ? t : null),
  getPayment: jest.fn(),
  getMerchantOrder: jest.fn(),
  getPreApproval: jest.fn(),
  mapMPStatusToPaymentStatus: jest.fn(),
  mapMPPaymentType: jest.fn(),
  mapMPPreApprovalStatus: jest.fn(),
}));
jest.mock('@/lib/billing/subscription-sync', () => ({ upsertSubscriptionFromGatewayEvent: jest.fn() }));
jest.mock('@/lib/payment-logger', () => ({
  logPaymentEvent: (...a: any[]) => logPaymentEvent(...a),
  PaymentEventType: { WEBHOOK_RECEIVED: 'webhook_received' },
}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/lib/payment-alert-service', () => ({ createPaymentAlert: jest.fn() }));
jest.mock('@/lib/mercadopago-connect/payment-sync', () => ({
  syncRestaurantPayment: (...a: any[]) => syncRestaurantPayment(...a),
}));

import { POST } from '../../app/api/pagamentos/mp/webhook/route';

function signedRequest(query: string, dataId: string, secret = SECRET) {
  const ts = '1790000000';
  const requestId = 'req-1';
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return new NextRequest(`https://gastrux.com/api/pagamentos/mp/webhook?${query}`, {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
  });
}

describe('POST /api/pagamentos/mp/webhook: IPN vs Webhooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('acknowledges a legacy IPN with 200 and processes nothing', async () => {
    const res = await POST(signedRequest('topic=payment&id=182349239220&rid=rest-1', '182349239220', 'wrong'));
    expect(res.status).toBe(200);
    expect(syncRestaurantPayment).not.toHaveBeenCalled();
    expect(logPaymentEvent).not.toHaveBeenCalled();
  });

  it('processes a signed Webhooks notification for a connected restaurant', async () => {
    const res = await POST(signedRequest('type=payment&data.id=182349239220&rid=rest-1', '182349239220'));
    expect(res.status).toBe(200);
    expect(syncRestaurantPayment).toHaveBeenCalledWith('rest-1', '182349239220');
  });

  it('still rejects a Webhooks notification with a bad signature', async () => {
    const res = await POST(signedRequest('type=payment&data.id=182349239220&rid=rest-1', '182349239220', 'wrong'));
    expect(res.status).toBe(401);
    expect(syncRestaurantPayment).not.toHaveBeenCalled();
  });
});
