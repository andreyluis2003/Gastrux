// @ts-nocheck
import {
  DEFAULT_DELIVERY_PAYMENT_SETTINGS,
  buildPaymentOptions,
  hasAnyPaymentOption,
  validatePaymentChoice,
  describePaymentForKitchen,
  isPayOnDelivery,
  parseSettingsInput,
} from '../../lib/delivery-payments/choice';

const allOn = {
  acceptCash: true,
  acceptCreditOnDelivery: true,
  acceptDebitOnDelivery: true,
  acceptVoucherOnDelivery: true,
  voucherBrands: ['VR', 'ALELO'],
};

describe('delivery-payments/choice', () => {
  describe('buildPaymentOptions', () => {
    it('uses the defaults when the restaurant never configured anything', () => {
      expect(buildPaymentOptions(null, false)).toEqual({
        online: { pix: false, card: false },
        onDelivery: { cash: true, credit: true, debit: true, voucher: { enabled: false, brands: [] } },
      });
      expect(DEFAULT_DELIVERY_PAYMENT_SETTINGS.acceptVoucherOnDelivery).toBe(false);
    });

    it('enables online PIX and card only when the Mercado Pago connection is usable', () => {
      expect(buildPaymentOptions(null, true).online).toEqual({ pix: true, card: true });
      expect(buildPaymentOptions(null, false).online).toEqual({ pix: false, card: false });
    });

    it('enables vouchers only with at least one valid brand and drops unknown brands', () => {
      const none = buildPaymentOptions({ ...allOn, voucherBrands: [] }, false);
      expect(none.onDelivery.voucher).toEqual({ enabled: false, brands: [] });

      const some = buildPaymentOptions({ ...allOn, voucherBrands: ['VR', 'BOGUS'] }, false);
      expect(some.onDelivery.voucher).toEqual({ enabled: true, brands: ['VR'] });

      const off = buildPaymentOptions({ ...allOn, acceptVoucherOnDelivery: false }, false);
      expect(off.onDelivery.voucher.enabled).toBe(false);
    });

    it('reports when nothing at all is available', () => {
      const off = { acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] };
      expect(hasAnyPaymentOption(buildPaymentOptions(off, false))).toBe(false);
      expect(hasAnyPaymentOption(buildPaymentOptions(off, true))).toBe(true);
      expect(hasAnyPaymentOption(buildPaymentOptions(null, false))).toBe(true);
    });
  });

  describe('validatePaymentChoice', () => {
    const options = buildPaymentOptions(allOn, true);

    it('requires a known payment method', () => {
      expect(validatePaymentChoice(options, {}, 50)).toEqual({ ok: false, error: 'Escolha a forma de pagamento' });
      expect(validatePaymentChoice(options, { paymentMethod: 'BITCOIN' }, 50)).toEqual({ ok: false, error: 'Escolha a forma de pagamento' });
      expect(validatePaymentChoice(options, { paymentMethod: 42 }, 50).ok).toBe(false);
    });

    it('rejects online methods when the restaurant has no usable connection', () => {
      const offline = buildPaymentOptions(allOn, false);
      const pix = validatePaymentChoice(offline, { paymentMethod: 'ONLINE_PIX' }, 50);
      const card = validatePaymentChoice(offline, { paymentMethod: 'ONLINE_CARD' }, 50);
      expect(pix).toEqual({ ok: false, error: 'Esta forma de pagamento não está disponível neste restaurante' });
      expect(card.ok).toBe(false);
    });

    it('accepts online methods and ignores change and voucher input for them', () => {
      const r = validatePaymentChoice(options, { paymentMethod: 'ONLINE_PIX', changeFor: 100, voucherBrand: 'VR' }, 50);
      expect(r).toEqual({ ok: true, choice: { paymentMethod: 'ONLINE_PIX', changeFor: null, voucherBrand: null } });
      expect(validatePaymentChoice(options, { paymentMethod: 'ONLINE_CARD' }, 50).ok).toBe(true);
    });

    it('accepts cash with no change, or with change at least the total', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH' }, 57.9)).toEqual({
        ok: true, choice: { paymentMethod: 'CASH', changeFor: null, voucherBrand: null },
      });
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: '' }, 57.9).choice.changeFor).toBeNull();
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: 100 }, 57.9).choice.changeFor).toBe(100);
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: '100' }, 57.9).choice.changeFor).toBe(100);
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: 57.9 }, 57.9).choice.changeFor).toBe(57.9);
    });

    it('rejects change below the total and invalid change values', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: 50 }, 57.9)).toEqual({
        ok: false, error: 'O valor para troco deve ser maior ou igual ao total do pedido',
      });
      for (const bad of [0, -5, 'abc', NaN, Infinity, true, [100], {}, 1e21, 100001]) {
        expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: bad }, 57.9)).toEqual({
          ok: false, error: 'Valor do troco inválido',
        });
      }
    });

    it('accepts credit and debit on delivery only when enabled', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'CREDIT_ON_DELIVERY' }, 50).ok).toBe(true);
      expect(validatePaymentChoice(options, { paymentMethod: 'DEBIT_ON_DELIVERY' }, 50).ok).toBe(true);
      const off = buildPaymentOptions({ ...allOn, acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false }, false);
      expect(validatePaymentChoice(off, { paymentMethod: 'CASH' }, 50).ok).toBe(false);
      expect(validatePaymentChoice(off, { paymentMethod: 'CREDIT_ON_DELIVERY' }, 50).ok).toBe(false);
      expect(validatePaymentChoice(off, { paymentMethod: 'DEBIT_ON_DELIVERY' }, 50).ok).toBe(false);
    });

    it('requires an accepted voucher brand, case-insensitive', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'VOUCHER_ON_DELIVERY' }, 50)).toEqual({
        ok: false, error: 'Escolha a bandeira do vale-refeição',
      });
      expect(validatePaymentChoice(options, { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'SODEXO' }, 50).ok).toBe(false);
      expect(validatePaymentChoice(options, { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'vr' }, 50)).toEqual({
        ok: true, choice: { paymentMethod: 'VOUCHER_ON_DELIVERY', changeFor: null, voucherBrand: 'VR' },
      });
      const noVoucher = buildPaymentOptions({ ...allOn, acceptVoucherOnDelivery: false }, false);
      expect(validatePaymentChoice(noVoucher, { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'VR' }, 50).ok).toBe(false);
    });
  });

  describe('describePaymentForKitchen', () => {
    const base = { changeFor: null, voucherBrand: null };

    it('describes online payments', () => {
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'ONLINE_PIX' }, 50)).toBe('Pagamento: PIX online');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'ONLINE_CARD' }, 50)).toBe('Pagamento: cartão online (Mercado Pago)');
    });

    it('tells the driver how much change to bring', () => {
      const note = describePaymentForKitchen({ ...base, paymentMethod: 'CASH', changeFor: 100 }, 57.9);
      expect(note).toBe('Pagamento na entrega: dinheiro — troco para R$ 100,00 (levar R$ 42,10 de troco)');
    });

    it('says no change when there is none to bring', () => {
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'CASH' }, 57.9)).toBe('Pagamento na entrega: dinheiro — sem troco');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'CASH', changeFor: 57.9 }, 57.9)).toBe('Pagamento na entrega: dinheiro — sem troco');
    });

    it('reminds the driver to bring the card machine', () => {
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'CREDIT_ON_DELIVERY' }, 50)).toBe('Pagamento na entrega: cartão de crédito (levar maquininha)');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'DEBIT_ON_DELIVERY' }, 50)).toBe('Pagamento na entrega: cartão de débito (levar maquininha)');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'ALELO' }, 50)).toBe(
        'Pagamento na entrega: vale-refeição/alimentação Alelo (levar maquininha)'
      );
    });
  });

  describe('isPayOnDelivery', () => {
    it('is true only for the four on-delivery methods', () => {
      for (const m of ['CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY']) expect(isPayOnDelivery(m)).toBe(true);
      for (const m of ['ONLINE_PIX', 'ONLINE_CARD', '', null, undefined, 'X']) expect(isPayOnDelivery(m)).toBe(false);
    });
  });

  describe('parseSettingsInput', () => {
    it('accepts a valid payload and de-duplicates brands', () => {
      const r = parseSettingsInput({ ...allOn, voucherBrands: ['VR', 'VR', 'ALELO'] });
      expect(r).toEqual({ ok: true, data: { ...allOn, voucherBrands: ['VR', 'ALELO'] } });
    });

    it('rejects non-boolean flags, non-array brands and unknown brands', () => {
      expect(parseSettingsInput({ ...allOn, acceptCash: 'yes' })).toEqual({ ok: false, error: 'Campo inválido: acceptCash' });
      expect(parseSettingsInput({ ...allOn, voucherBrands: 'VR' })).toEqual({ ok: false, error: 'Campo inválido: voucherBrands' });
      expect(parseSettingsInput({ ...allOn, voucherBrands: ['VR', 'BOGUS'] })).toEqual({ ok: false, error: 'Bandeira inválida: BOGUS' });
      expect(parseSettingsInput(null)).toEqual({ ok: false, error: 'Corpo da requisição inválido' });
    });

    it('requires at least one brand when vouchers are enabled', () => {
      expect(parseSettingsInput({ ...allOn, voucherBrands: [] })).toEqual({ ok: false, error: 'Escolha ao menos uma bandeira de vale-refeição' });
      expect(parseSettingsInput({ ...allOn, acceptVoucherOnDelivery: false, voucherBrands: [] }).ok).toBe(true);
    });
  });
});
