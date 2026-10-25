// @ts-nocheck
/**
 * Consumo de insumos (2026-10-25, found while recording the tutorial videos): sales and losses write their stock
 * movements with a NEGATIVE quantity, and the screen added them as they were ("Total consumido -67,06",
 * "Custo -R$ 252,50"), the same mistake the CMV had (d2f69c0). What left the stock counts as a positive amount.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as SUMMARY } from '../../../app/api/consumption/summary/route';
import { GET as TOP } from '../../../app/api/consumption/top-ingredients/route';
import { GET as TRENDS } from '../../../app/api/consumption/trends/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('consumo de insumos: signs', () => {
  let ownerId, rid, carne;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `consg-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `CONSG ${tag}`, ownerId, status: 'ACTIVE', isInternal: true } })).id;
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    carne = await prisma.ingredient.create({ data: { restaurantId: rid, code: `G${tag}`, name: 'Carne', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 40 } });
    const at = new Date(Date.now() - 60_000);
    const mv = (movementType, quantity) => prisma.stockMovement.create({ data: { restaurantId: rid, ingredientId: carne.id, movementType, quantity, createdAt: at } });
    // As the system writes them: a sale and a loss take stock out with a negative quantity
    await mv('AUTO_DEDUCTION', -2);
    await mv('LOSS', -0.5);
    await mv('MANUAL_DEDUCTION', -1);
  }, 60000);

  afterAll(async () => {
    try { await prisma.stockMovement.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.ingredient.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('shows what left the stock as positive amounts', async () => {
    const out = await (await SUMMARY(new NextRequest('http://x/api/consumption/summary?period=30'))).json();
    expect(out.summary.totalQuantity).toBeCloseTo(3.5, 6);
    expect(out.summary.totalCost).toBeCloseTo(140, 6);
    expect(JSON.stringify(out)).not.toMatch(/"totalQuantity":-|"totalCost":-/);

    const top = await (await TOP(new NextRequest('http://x/api/consumption/top-ingredients?period=30'))).json();
    expect(JSON.stringify(top)).not.toMatch(/:-\d/);

    const trends = await (await TRENDS(new NextRequest('http://x/api/consumption/trends?period=30'))).json();
    expect(JSON.stringify(trends)).not.toMatch(/:-\d/);
  });
});
