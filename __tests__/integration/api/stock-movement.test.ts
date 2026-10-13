// @ts-nocheck
/**
 * Nova Movimentação (POST /api/stock/movement): the first movement of an ingredient starts its stock
 * (2026-10-13: an ENTRY on an ingredient without a Stock row was recorded but never counted, so a new
 * account's first purchase vanished from Estoque).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as move } from '../../../app/api/stock/movement/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('Nova Movimentação starts the stock of an ingredient', () => {
  let ownerId, rid, catId;
  const email = `sm-${tag}@gastrux.test`;
  const post = (body) => move(new Request('http://x/api/stock/movement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any, { params: {} });
  const newIngredient = async (code) =>
    (await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: catId, code: `${code}-${tag}`, name: code, standardUnit: 'kg', purchaseUnit: 'kg' } })).id;
  const stockOf = async (ingredientId) => (await prisma.stock.findFirst({ where: { ingredientId } }))?.currentQuantity ?? null;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SM ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    catId = (await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `SM ${tag}` } })).id;
    const s = { user: { id: ownerId, email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  });
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { userId: ownerId } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('the first entry creates the stock; the next movements add and take', async () => {
    const id = await newIngredient('Arroz');
    expect(await stockOf(id)).toBeNull();
    expect((await post({ ingredientId: id, movementType: 'ENTRY', quantity: 5 })).status).toBeLessThan(300);
    expect(await stockOf(id)).toBe(5);
    expect((await post({ ingredientId: id, movementType: 'MANUAL_DEDUCTION', quantity: 2 })).status).toBeLessThan(300);
    expect(await stockOf(id)).toBe(3);
  });

  it('an exit on an ingredient without stock starts it below zero (the manager\'s own movement)', async () => {
    const id = await newIngredient('Feijao');
    expect((await post({ ingredientId: id, movementType: 'MANUAL_DEDUCTION', quantity: 2 })).status).toBeLessThan(300);
    expect(await stockOf(id)).toBe(-2);
  });

  it('an ingredient of another restaurant is refused and its stock is never created', async () => {
    const other = (await prisma.restaurant.create({ data: { name: `SMO ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    try {
      const cat = await prisma.ingredientCategory.create({ data: { restaurantId: other, name: `SMO ${tag}` } });
      const theirs = (await prisma.ingredient.create({ data: { restaurantId: other, categoryId: cat.id, code: `SMO-${tag}`, name: 'Alheio', standardUnit: 'kg', purchaseUnit: 'kg' } })).id;
      expect((await post({ ingredientId: theirs, movementType: 'ENTRY', quantity: 5 })).status).toBe(404);
      expect(await stockOf(theirs)).toBeNull();
      expect(await prisma.stockMovement.count({ where: { ingredientId: theirs } })).toBe(0);
    } finally { await prisma.restaurant.delete({ where: { id: other } }); }
  });
});
