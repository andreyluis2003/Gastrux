import { parseChangeInput, toPaymentPayload, EMPTY_PAYMENT_CHOICE, type PaymentChoice } from '@/lib/delivery-payments/payment-payload';
import { validatePaymentChoice, buildPaymentOptions } from '@/lib/delivery-payments/choice';

const choice = (over: Partial<PaymentChoice>): PaymentChoice => ({ ...EMPTY_PAYMENT_CHOICE, ...over });

describe('parseChangeInput', () => {
  it('treats empty text as "no change needed"', () => {
    expect(parseChangeInput('')).toEqual({ valid: true });
    expect(parseChangeInput('   ')).toEqual({ valid: true });
  });

  it('accepts integers and 1-2 decimals with dot or comma', () => {
    expect(parseChangeInput('100')).toEqual({ valid: true, value: 100 });
    expect(parseChangeInput('100,50')).toEqual({ valid: true, value: 100.5 });
    expect(parseChangeInput('100.5')).toEqual({ valid: true, value: 100.5 });
    expect(parseChangeInput(' 50 ')).toEqual({ valid: true, value: 50 });
  });

  it.each(['1e3', '0x64', '1.000,00', '1.000', '-5', '10,555', 'abc', '100 reais', ',5', '1,', 'Infinity'])(
    'rejects %p as not strictly numeric',
    (text) => {
      const result = parseChangeInput(text);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/troco/);
    }
  );

  it('rejects zero and values above the cap', () => {
    expect(parseChangeInput('0').valid).toBe(false);
    expect(parseChangeInput('0,00').valid).toBe(false);
    expect(parseChangeInput('100000').valid).toBe(true);
    expect(parseChangeInput('100000,01').valid).toBe(false);
    expect(parseChangeInput('100001').valid).toBe(false);
  });

  it('checks against the total only when a total is given', () => {
    expect(parseChangeInput('20', 45.9)).toEqual({
      valid: false,
      error: 'O valor para troco deve ser maior ou igual ao total do pedido',
    });
    expect(parseChangeInput('20').valid).toBe(true);
    expect(parseChangeInput('45,90', 45.9)).toEqual({ valid: true, value: 45.9 });
  });
});

describe('toPaymentPayload', () => {
  it('asks for a method when none is chosen', () => {
    expect(toPaymentPayload(EMPTY_PAYMENT_CHOICE, 40)).toEqual({ ok: false, error: 'Escolha a forma de pagamento' });
  });

  describe('CASH', () => {
    it('sends no changeFor when the field is empty', () => {
      expect(toPaymentPayload(choice({ method: 'CASH' }), 40)).toEqual({ ok: true, payload: { paymentMethod: 'CASH' } });
    });

    it('sends a numeric changeFor (never text: the server does Number(text))', () => {
      expect(toPaymentPayload(choice({ method: 'CASH', changeFor: '100' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'CASH', changeFor: 100 },
      });
      expect(toPaymentPayload(choice({ method: 'CASH', changeFor: '100,50' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'CASH', changeFor: 100.5 },
      });
    });

    it('blocks thousands separators and exponent/hex text', () => {
      for (const text of ['1.000,00', '1e3', '0x64']) {
        const result = toPaymentPayload(choice({ method: 'CASH', changeFor: text }), 40);
        expect(result.ok).toBe(false);
      }
    });

    it('blocks a change below the total, and accepts exactly the total', () => {
      expect(toPaymentPayload(choice({ method: 'CASH', changeFor: '30' }), 40)).toEqual({
        ok: false,
        error: 'O valor para troco deve ser maior ou igual ao total do pedido',
      });
      expect(toPaymentPayload(choice({ method: 'CASH', changeFor: '40' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'CASH', changeFor: 40 },
      });
    });

    it('blocks a change above the cap', () => {
      const result = toPaymentPayload(choice({ method: 'CASH', changeFor: '100001' }), 40);
      expect(result).toEqual({ ok: false, error: expect.stringContaining('troco') });
    });

    it('never sends a stale voucherBrand', () => {
      expect(toPaymentPayload(choice({ method: 'CASH', voucherBrand: 'VR' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'CASH' },
      });
    });
  });

  describe('stale values typed under another method', () => {
    it('omits an invalid changeFor for PIX and does not block the order', () => {
      expect(toPaymentPayload(choice({ method: 'ONLINE_PIX', changeFor: '1e3' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'ONLINE_PIX' },
      });
    });

    it.each(['ONLINE_CARD', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY'] as const)('omits changeFor and voucherBrand for %s', (method) => {
      expect(toPaymentPayload(choice({ method, changeFor: '9', voucherBrand: 'VR' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: method },
      });
    });

    it('omits a valid changeFor for PIX', () => {
      expect(toPaymentPayload(choice({ method: 'ONLINE_PIX', changeFor: '100' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'ONLINE_PIX' },
      });
    });
  });

  describe('VOUCHER_ON_DELIVERY', () => {
    it('sends the brand and no changeFor', () => {
      expect(toPaymentPayload(choice({ method: 'VOUCHER_ON_DELIVERY', voucherBrand: 'ALELO', changeFor: 'x' }), 40)).toEqual({
        ok: true,
        payload: { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'ALELO' },
      });
    });

    it('asks for the brand instead of sending an order the server would reject', () => {
      expect(toPaymentPayload(choice({ method: 'VOUCHER_ON_DELIVERY' }), 40)).toEqual({
        ok: false,
        error: 'Escolha a bandeira do vale-refeição',
      });
      expect(toPaymentPayload(choice({ method: 'VOUCHER_ON_DELIVERY', voucherBrand: '  ' }), 40).ok).toBe(false);
    });
  });

  describe('agreement with the server rule (validatePaymentChoice)', () => {
    const options = buildPaymentOptions(
      {
        acceptCash: true,
        acceptCreditOnDelivery: true,
        acceptDebitOnDelivery: true,
        acceptVoucherOnDelivery: true,
        voucherBrands: ['VR'],
      },
      true
    );

    it.each(['', '100', '100,50', '40', '39,99', '1e3', '0x64', '1.000,00', '0', '100000', '100001'])(
      'never lets through a change the server rejects: %p',
      (text) => {
        const client = toPaymentPayload(choice({ method: 'CASH', changeFor: text }), 40);
        if (client.ok) {
          const server = validatePaymentChoice(options, client.payload, 40);
          expect(server.ok).toBe(true);
        } else {
          // Blocked before submitting: there is no order body to compare.
          expect(client.error).toEqual(expect.any(String));
        }
      }
    );
  });
});
