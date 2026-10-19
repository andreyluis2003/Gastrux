// @ts-nocheck
/**
 * Consumo de insumos counts what leaves the stock by default: sales (automatic), manual exits and losses. It used to
 * count only manual exits, so the sales consumption never showed (audit of the pages left out of Início, 2026-10-19).
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

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('consumo de insumos', () => {
  let ownerId, rid, carne;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `cons-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `CONS ${tag}`, ownerId, status: 'ACTIVE', isInternal: true } })).id;
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    carne = await prisma.ingredient.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Carne', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 40 } });
    const mv = (movementType, quantity) => prisma.stockMovement.create({ data: { restaurantId: rid, ingredientId: carne.id, movementType, quantity } });
    await mv('AUTO_DEDUCTION', 2);
    await mv('MANUAL_DEDUCTION', 1);
    await mv('LOSS', 0.5);
    await mv('ENTRY', 10);
  }, 60000);
  afterAll(async () => {
    try { await prisma.stockMovement.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.ingredient.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('by default: sales, manual exits and losses; never the entries', async () => {
    const out = await (await SUMMARY(new NextRequest('http://x/api/consumption/summary?period=30'))).json();
    expect(out.summary.totalQuantity).toBeCloseTo(3.5, 6);
    expect(out.summary.totalMovements).toBe(3);
    const top = await (await TOP(new NextRequest('http://x/api/consumption/top-ingredients?period=30'))).json();
    expect(JSON.stringify(top)).toContain('Carne');
  });
});
