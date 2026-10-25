/**
 * Kitchen order numbers (lib/kds/order-number.ts). The next number came from the most recently created
 * KDS order; when the newest order does not hold the highest number (clocks of two servers apart, or
 * shifted data), every retry picked the same taken number and "Enviar para cozinha" failed with 500
 * (found while recording the tutorial videos, 2026-10-25).
 */
// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { nextKdsOrderNumber, withKdsOrderNumber } from '../../lib/kds/order-number';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('kitchen order number', () => {
  let restaurantId: string;
  let ownerId: string;
  const numbers = ['KDS-990000', 'KDS-990001'];

  beforeAll(async () => {
    const tag = Date.now();
    const owner = await prisma.user.create({ data: { email: `kds-num-${tag}@test.local`, name: 'Dono' } });
    ownerId = owner.id;
    restaurantId = (await prisma.restaurant.create({ data: { name: `KDS numero ${tag}`, ownerId } })).id;
    // The highest number is the OLDER order; the newest order holds a lower number
    await prisma.order.create({ data: { restaurantId, orderNumber: numbers[1], createdAt: new Date(Date.now() - 3600_000) } });
    await prisma.order.create({ data: { restaurantId, orderNumber: numbers[0], createdAt: new Date() } });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('comes after the highest number, not after the newest order', async () => {
    expect(await nextKdsOrderNumber()).toBe('KDS-990002');
  });

  it('creates the order instead of failing on the taken number', async () => {
    const order = await withKdsOrderNumber((orderNumber) => prisma.order.create({ data: { restaurantId, orderNumber } }));
    expect(order.orderNumber).toBe('KDS-990002');
  });
});
