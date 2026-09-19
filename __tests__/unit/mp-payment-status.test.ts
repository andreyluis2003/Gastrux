// @ts-nocheck
import { canTransition } from '../../lib/mercadopago-connect/payment-status';

describe('mercadopago-connect/payment-status canTransition', () => {
  it.each([
    ['PENDING', 'PROCESSING'],
    ['PENDING', 'APPROVED'],
    ['PENDING', 'DECLINED'],
    ['PENDING', 'CANCELLED'],
    ['PROCESSING', 'APPROVED'],
    ['PROCESSING', 'DECLINED'],
    ['DECLINED', 'APPROVED'],
    ['DECLINED', 'PROCESSING'],
    ['APPROVED', 'REFUNDED'],
    ['APPROVED', 'CHARGEBACK'],
    ['PARTIALLY_REFUNDED', 'REFUNDED'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['APPROVED', 'APPROVED'],
    ['APPROVED', 'PENDING'],
    ['APPROVED', 'DECLINED'],
    ['REFUNDED', 'APPROVED'],
    ['CANCELLED', 'APPROVED'],
    ['CHARGEBACK', 'APPROVED'],
    ['PARTIALLY_REFUNDED', 'APPROVED'],
    ['PENDING', 'REFUNDED'],
    ['PENDING', 'PENDING'],
    ['SETTLED', 'APPROVED'],
    ['UNKNOWN', 'APPROVED'],
  ])('blocks %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
