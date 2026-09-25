// @ts-nocheck
/**
 * Kitchen gating: an online (PIX/card) order is hidden from every kitchen
 * listing until its payment is APPROVED. DB-free: the shared `where` is
 * evaluated in plain code (with SQL's NULL semantics) and the three kitchen
 * queries are checked with prisma mocked.
 */
const prismaMock = {
  order: { findMany: jest.fn(), count: jest.fn() },
  kitchenStation: { findMany: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/socket', () => ({ broadcastOrderCreated: jest.fn(), broadcastOrderUpdate: jest.fn() }));
jest.mock('@/lib/notification-utils', () => ({ notifyNewOrder: jest.fn() }));
jest.mock('@/lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn().mockResolvedValue('rest-1') }));

import { KITCHEN_VISIBLE_ORDER_WHERE, isVisibleToKitchen } from '@/lib/kds-visibility';
import { getStationOrders } from '@/lib/kds-integration';
import { GET as getKdsOrders } from '../../app/api/kds/orders/route';
import { GET as getKdsStations } from '../../app/api/kds/stations/route';

const METHODS = [null, 'ONLINE_PIX', 'ONLINE_CARD', 'CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY'];
const STATUSES = ['PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'CHARGEBACK', 'SETTLED'];

/** Evaluates the small subset of Prisma `where` the gate uses, with SQL NULL semantics. */
function matches(where: any, row: any): boolean {
  if (where.OR) return where.OR.some((w: any) => matches(w, row));
  if (where.AND) return where.AND.every((w: any) => matches(w, row));
  return Object.entries(where).every(([field, cond]: [string, any]) => {
    const value = row[field] ?? null;
    if (cond === null) return value === null;
    if (typeof cond === 'string') return value === cond;
    if (cond.notIn) return value !== null && !cond.notIn.includes(value);
    throw new Error('unsupported condition');
  });
}

describe('kitchen visibility rule', () => {
  const cases = METHODS.flatMap((paymentMethod) => STATUSES.map((paymentStatus) => ({ paymentMethod, paymentStatus })));

  it.each(cases)('%j', (order) => {
    const online = order.paymentMethod === 'ONLINE_PIX' || order.paymentMethod === 'ONLINE_CARD';
    const expected = !online || order.paymentStatus === 'APPROVED';
    expect(isVisibleToKitchen(order)).toBe(expected);
    // the Prisma where and the plain-code predicate must agree for every combination
    expect(matches(KITCHEN_VISIBLE_ORDER_WHERE, order)).toBe(expected);
  });

  it('a null method stays visible whatever the payment status (table and legacy orders)', () => {
    for (const paymentStatus of STATUSES) {
      expect(matches(KITCHEN_VISIBLE_ORDER_WHERE, { paymentMethod: null, paymentStatus })).toBe(true);
    }
  });

  it('an ONLINE order appears once APPROVED and disappears again when refunded', () => {
    expect(isVisibleToKitchen({ paymentMethod: 'ONLINE_CARD', paymentStatus: 'PENDING' })).toBe(false);
    expect(isVisibleToKitchen({ paymentMethod: 'ONLINE_CARD', paymentStatus: 'APPROVED' })).toBe(true);
    expect(isVisibleToKitchen({ paymentMethod: 'ONLINE_PIX', paymentStatus: 'REFUNDED' })).toBe(false);
  });
});

describe('kitchen queries carry the rule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.kitchenStation.findMany.mockResolvedValue([]);
  });

  it('GET /api/kds/orders lists and counts only kitchen-visible orders, keeping the caller filters', async () => {
    await getKdsOrders(new Request('https://gastrux.test/api/kds/orders?priority=URGENT') as any);
    const listWhere = prismaMock.order.findMany.mock.calls[0][0].where;
    const countWhere = prismaMock.order.count.mock.calls[0][0].where;
    for (const where of [listWhere, countWhere]) {
      expect(where.AND).toContainEqual(KITCHEN_VISIBLE_ORDER_WHERE);
      expect(where.priority).toBe('URGENT');
    }
  });

  it('GET /api/kds/stations does not count unpaid online orders as station workload', async () => {
    await getKdsStations();
    const include = prismaMock.kitchenStation.findMany.mock.calls[0][0].include;
    expect(include.items.where.order.AND).toContainEqual(KITCHEN_VISIBLE_ORDER_WHERE);
    expect(include.items.where.order.status).toEqual({ in: ['PENDING', 'PREPARING'] });
    expect(include.assignments.where.order.AND).toContainEqual(KITCHEN_VISIBLE_ORDER_WHERE);
  });

  it('getStationOrders applies the rule', async () => {
    await getStationOrders('station-1');
    const where = prismaMock.order.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual(KITCHEN_VISIBLE_ORDER_WHERE);
    expect(where.items).toEqual({ some: { stationId: 'station-1' } });
  });
});
