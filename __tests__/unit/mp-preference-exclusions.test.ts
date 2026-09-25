// @ts-nocheck
jest.mock('mercadopago', () => {
  const preferenceCreate = jest.fn().mockResolvedValue({ id: 'pref' });
  return {
    __mocks: { preferenceCreate },
    MercadoPagoConfig: jest.fn(),
    Payment: jest.fn(),
    Preference: jest.fn(() => ({ create: preferenceCreate })),
    PreApproval: jest.fn(),
    MerchantOrder: jest.fn(),
  };
});

import * as mp from 'mercadopago';
import { createCheckoutPreference } from '../../lib/mercado-pago';

const mocks = (mp as any).__mocks;
const client = { accessToken: 'restaurant-token' } as any;

const input = {
  orderId: 'o1',
  items: [{ id: 'i', title: 'Pedido', quantity: 1, unitPrice: 25 }],
  payer: { email: 'a@b.com' },
  backUrls: { success: 's', failure: 'f', pending: 'p' },
  notificationUrl: 'https://x/webhook?rid=r1',
  externalReference: 'pay1',
};

describe('createCheckoutPreference excludedPaymentTypes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps today\'s behavior when nothing is excluded (billing and staff checkout)', async () => {
    await createCheckoutPreference(input, client);
    const body = mocks.preferenceCreate.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual([]);
    expect(body.payment_methods.installments).toBe(12);
  });

  it('sends each excluded payment type as an { id } object', async () => {
    await createCheckoutPreference({ ...input, excludedPaymentTypes: ['ticket', 'atm'] }, client);
    const body = mocks.preferenceCreate.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual([{ id: 'ticket' }, { id: 'atm' }]);
    expect(body.payment_methods.installments).toBe(12);
  });
});
