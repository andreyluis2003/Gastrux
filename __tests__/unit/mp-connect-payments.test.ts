// @ts-nocheck
jest.mock('mercadopago', () => {
  const paymentCreate = jest.fn();
  const paymentGet = jest.fn();
  const refundCreate = jest.fn();
  const refundTotal = jest.fn();
  return {
    __mocks: { paymentCreate, paymentGet, refundCreate, refundTotal },
    MercadoPagoConfig: jest.fn(),
    Payment: jest.fn(() => ({ create: paymentCreate, get: paymentGet })),
    PaymentRefund: jest.fn(() => ({ create: refundCreate, total: refundTotal })),
  };
});

import * as mp from 'mercadopago';
import {
  createConnectPix,
  extractPixData,
  getConnectPayment,
  refundConnectPayment,
  isUnauthorizedError,
  toMpDate,
  notificationUrlFor,
} from '../../lib/mercadopago-connect/payments';

const mocks = (mp as any).__mocks;
const client = { accessToken: 'restaurant-token' } as any;

describe('mercadopago-connect/payments', () => {
  const originalUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'https://gastrux.test/';
  });

  afterAll(() => {
    process.env.NEXTAUTH_URL = originalUrl;
  });

  it('formats dates with the fixed -03:00 offset', () => {
    expect(toMpDate(new Date('2026-09-19T13:00:00.000Z'))).toBe('2026-09-19T10:00:00.000-03:00');
  });

  it('builds a notification URL carrying the restaurant id', () => {
    expect(notificationUrlFor('rest 1')).toBe('https://gastrux.test/api/pagamentos/mp/webhook?rid=rest%201');
  });

  it('creates a PIX payment with our payment id as reference and idempotency key', async () => {
    mocks.paymentCreate.mockResolvedValue({ id: 1 });

    await createConnectPix(client, {
      paymentId: 'pay_123',
      restaurantId: 'rest_9',
      amount: 57.9,
      description: 'Pedido 42',
      payer: { email: 'a@b.com', name: 'Maria da Silva' },
    });

    expect(mp.Payment).toHaveBeenCalledWith(client);
    const args = mocks.paymentCreate.mock.calls[0][0];
    expect(args.body).toMatchObject({
      transaction_amount: 57.9,
      description: 'Pedido 42',
      payment_method_id: 'pix',
      external_reference: 'pay_123',
      notification_url: 'https://gastrux.test/api/pagamentos/mp/webhook?rid=rest_9',
      payer: { email: 'a@b.com', first_name: 'Maria', last_name: 'da Silva' },
    });
    expect(args.body.date_of_expiration).toMatch(/-03:00$/);
    expect(args.body).not.toHaveProperty('marketplace_fee');
    expect(args.requestOptions).toEqual({ idempotencyKey: 'pay_123' });
  });

  it('extracts the PIX data from the Mercado Pago response', () => {
    expect(
      extractPixData({
        date_of_expiration: '2026-09-19T10:30:00.000-03:00',
        point_of_interaction: { transaction_data: { qr_code: 'QR', qr_code_base64: 'B64', ticket_url: 'https://t' } },
      })
    ).toEqual({ qrCode: 'QR', qrCodeBase64: 'B64', ticketUrl: 'https://t', expirationDate: '2026-09-19T10:30:00.000-03:00' });

    expect(extractPixData({})).toEqual({ qrCode: '', qrCodeBase64: '', ticketUrl: '', expirationDate: null });
  });

  it('fetches a payment with the given client', async () => {
    mocks.paymentGet.mockResolvedValue({ id: 5 });
    await getConnectPayment(client, '5');
    expect(mp.Payment).toHaveBeenCalledWith(client);
    expect(mocks.paymentGet).toHaveBeenCalledWith({ id: '5' });
  });

  it('refunds partially with create and fully with total (never with cancel)', async () => {
    mocks.refundCreate.mockResolvedValue({ id: 1 });
    mocks.refundTotal.mockResolvedValue({ id: 2 });

    await refundConnectPayment(client, '77', 10.5);
    expect(mocks.refundCreate).toHaveBeenCalledWith({ payment_id: '77', body: { amount: 10.5 } });

    await refundConnectPayment(client, '77');
    expect(mocks.refundTotal).toHaveBeenCalledWith({ payment_id: '77' });
  });

  it('detects unauthorized errors from the SDK shapes', () => {
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true);
    expect(isUnauthorizedError({ cause: [{ code: 401 }] })).toBe(false);
    expect(isUnauthorizedError({ status: 500 })).toBe(false);
    expect(isUnauthorizedError(new Error('boom'))).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
  });
});
