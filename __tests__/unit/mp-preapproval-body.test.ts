// @ts-nocheck
jest.mock('mercadopago', () => {
  process.env.MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'platform-token';
  const preApprovalCreate = jest.fn().mockResolvedValue({ id: 'pre', init_point: 'https://mp/checkout' });
  return {
    __mocks: { preApprovalCreate },
    MercadoPagoConfig: jest.fn((cfg) => ({ ...cfg })),
    Payment: jest.fn(),
    Preference: jest.fn(),
    PreApproval: jest.fn(() => ({ create: preApprovalCreate })),
    MerchantOrder: jest.fn(),
  };
});

import * as mp from 'mercadopago';
import { createPreApproval } from '../../lib/mercado-pago';

const input = {
  payerEmail: 'dono@restaurante.com',
  backUrl: 'https://gastrux.com/billing/success?subscription_id=s1',
  reason: 'Assinatura Pro - Gastrux',
  externalReference: 's1',
  autoRecurring: { frequency: 1, frequencyType: 'months', transactionAmount: 99, currencyId: 'BRL' },
};

describe('createPreApproval request body', () => {
  beforeEach(() => jest.clearAllMocks());

  // Production 2026-10-10: the first subscription showed "R$ 99/mês" with no free trial on the
  // Mercado Pago review page. The API takes snake_case; frequencyType was sent as is.
  it('sends the free trial in the API format (frequency_type)', async () => {
    await createPreApproval({
      ...input,
      autoRecurring: { ...input.autoRecurring, freeTrial: { frequency: 30, frequencyType: 'days' } },
    });
    const { body } = mp.__mocks.preApprovalCreate.mock.calls[0][0];
    expect(body.auto_recurring.free_trial).toEqual({ frequency: 30, frequency_type: 'days' });
  });

  it('sends no free trial when the owner already had one', async () => {
    await createPreApproval(input);
    const { body } = mp.__mocks.preApprovalCreate.mock.calls[0][0];
    expect(body.auto_recurring.free_trial).toBeUndefined();
    expect(body.auto_recurring.frequency_type).toBe('months');
  });
});
