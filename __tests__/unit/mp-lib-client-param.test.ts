// @ts-nocheck
jest.mock('mercadopago', () => {
  // lib/mercado-pago.ts reads the platform token when it is imported, so the
  // variable must exist before that import. This factory runs first (the lib's
  // first import is 'mercadopago'), regardless of how imports are ordered.
  process.env.MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'platform-token';
  const paymentGet = jest.fn().mockResolvedValue({ id: 1 });
  const preferenceCreate = jest.fn().mockResolvedValue({ id: 'pref' });
  return {
    __mocks: { paymentGet, preferenceCreate },
    MercadoPagoConfig: jest.fn((cfg) => ({ ...cfg, isPlatform: true })),
    Payment: jest.fn(() => ({ get: paymentGet })),
    Preference: jest.fn(() => ({ create: preferenceCreate })),
    PreApproval: jest.fn(),
    MerchantOrder: jest.fn(),
  };
});

import * as mp from 'mercadopago';
import { getPayment, createCheckoutPreference, createPixPreference } from '../../lib/mercado-pago';

const restaurantClient = { accessToken: 'restaurant-token', isPlatform: false } as any;

const preferenceInput = {
  orderId: 'o1',
  items: [{ id: 'i', title: 'Item', quantity: 1, unitPrice: 10 }],
  payer: { email: 'a@b.com' },
  backUrls: { success: 's', failure: 'f', pending: 'p' },
  notificationUrl: 'https://x/webhook?rid=r1',
  externalReference: 'pay1',
};

describe('lib/mercado-pago optional client argument', () => {
  // Order matters here: the platform client is a lazy singleton, so the test
  // that builds it ("without a client") runs before any test that asserts it
  // was NOT built, and jest.clearAllMocks() resets only the call history.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getPayment without a client still uses the platform client (billing keeps working)', async () => {
    await getPayment('1');
    expect(mp.MercadoPagoConfig).toHaveBeenCalledTimes(1);
    expect(mp.Payment.mock.calls[0][0].isPlatform).toBe(true);
  });

  it('getPayment uses the provided client and never builds the platform one', async () => {
    await getPayment('1', restaurantClient);
    expect(mp.Payment).toHaveBeenCalledWith(restaurantClient);
    expect(mp.MercadoPagoConfig).not.toHaveBeenCalled();
  });

  it('createCheckoutPreference uses the provided client', async () => {
    await createCheckoutPreference(preferenceInput, restaurantClient);
    expect(mp.Preference).toHaveBeenCalledWith(restaurantClient);
    expect(mp.MercadoPagoConfig).not.toHaveBeenCalled();
  });

  it('createPixPreference passes the provided client through', async () => {
    const { items, ...rest } = preferenceInput;
    await createPixPreference({ ...rest, amount: 10, description: 'PIX' }, restaurantClient);
    expect(mp.Preference).toHaveBeenCalledWith(restaurantClient);
    expect(mp.MercadoPagoConfig).not.toHaveBeenCalled();
  });
});
