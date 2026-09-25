// @ts-nocheck
import {
  canMoveExternalOrderStatus,
  isExternalOrderStatus,
  EXTERNAL_ORDER_STATUSES,
} from '../../lib/delivery-integration/external-order-status';

describe('delivery-integration/external-order-status', () => {
  it.each([
    ['PENDING', 'CONFIRMED'],
    ['PENDING', 'READY'], // skipping steps is fine: an intermediate event can be lost
    ['CONFIRMED', 'PREPARING'],
    ['PREPARING', 'READY'],
    ['READY', 'PICKED_UP'],
    ['PICKED_UP', 'DELIVERED'],
    ['PENDING', 'CANCELLED'],
    ['PREPARING', 'CANCELLED'],
    ['PICKED_UP', 'CANCELLED'],
    ['PENDING', 'REJECTED'],
  ])('moves %s -> %s', (from, to) => {
    expect(canMoveExternalOrderStatus(from, to)).toBe(true);
  });

  it.each([
    ['PENDING', 'PENDING'],
    ['READY', 'READY'],
    ['READY', 'PREPARING'],
    ['READY', 'PENDING'],
    ['DELIVERED', 'PREPARING'],
    ['DELIVERED', 'CANCELLED'],
    ['CANCELLED', 'PREPARING'],
    ['CANCELLED', 'DELIVERED'],
    ['REJECTED', 'CONFIRMED'],
    ['CANCELLED', 'REJECTED'],
    ['PENDING', 'TELEPORTED'],
    ['UNKNOWN', 'CONFIRMED'],
  ])('blocks %s -> %s', (from, to) => {
    expect(canMoveExternalOrderStatus(from, to)).toBe(false);
  });

  it('recognises exactly the enum names', () => {
    for (const s of EXTERNAL_ORDER_STATUSES) expect(isExternalOrderStatus(s)).toBe(true);
    for (const v of ['pending', 'TELEPORTED', '', null, undefined, 5]) expect(isExternalOrderStatus(v)).toBe(false);
  });
});
