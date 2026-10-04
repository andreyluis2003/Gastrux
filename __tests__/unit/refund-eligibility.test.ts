import { isRefundable, refundableAmount } from '../../lib/payments/refund-eligibility';

const p = (over: any = {}) => ({ gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', amount: 40, refunds: [], ...over });

describe('refund eligibility (Estornar button and refund route)', () => {
  it('an approved Mercado Pago payment is refundable in full', () => {
    expect(isRefundable(p())).toBe(true);
    expect(refundableAmount(p())).toBe(40);
  });

  it('only completed refunds count, in cents', () => {
    const pay = p({ amount: '10.30', refunds: [{ amount: '0.10', status: 'completed' }, { amount: 5, status: 'failed' }] });
    expect(refundableAmount(pay)).toBe(10.2);
  });

  it('a partially refunded payment keeps the rest refundable; a fully refunded one does not', () => {
    expect(isRefundable(p({ status: 'PARTIALLY_REFUNDED', refunds: [{ amount: 15, status: 'completed' }] }))).toBe(true);
    expect(isRefundable(p({ status: 'PARTIALLY_REFUNDED', refunds: [{ amount: 40, status: 'completed' }] }))).toBe(false);
    expect(isRefundable(p({ status: 'REFUNDED' }))).toBe(false);
  });

  it('pending, declined and non Mercado Pago payments are not refundable', () => {
    expect(isRefundable(p({ status: 'PENDING' }))).toBe(false);
    expect(isRefundable(p({ status: 'DECLINED' }))).toBe(false);
    expect(isRefundable(p({ gateway: 'STRIPE_CONNECT' }))).toBe(false);
    expect(isRefundable(p({ gateway: 'MANUAL' }))).toBe(false);
  });
});
