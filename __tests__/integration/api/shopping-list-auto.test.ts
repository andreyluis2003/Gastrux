// @ts-nocheck
/**
 * Compras > Gerar Automaticamente: insumos below the minimum without a linked supplier were skipped in
 * silence and the answer said "Nenhum ingrediente abaixo do estoque mínimo encontrado", while Estoque showed
 * them as Crítico (found while recording the tutorial videos, 2026-10-25). Now the answer names them and
 * says what is missing.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as postList } from '../../../app/api/shopping-lists/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('Compras: automatic list', () => {
  let ownerId, rid, catId;
  const email = `sla-${tag}@gastrux.test`;
  const generate = () =>
    postList(new Request('http://x/api/shopping-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoGenerate: true }) }) as any);
  const ingredient = async (name, quantity, minimumStock) => {
    const id = (await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: catId, code: `${name}-${tag}`, name, standardUnit: 'kg', purchaseUnit: 'kg', minimumStock } })).id;
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: id, currentQuantity: quantity } });
    return id;
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SLA ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    catId = (await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `SLA ${tag}` } })).id;
    const s = { user: { id: ownerId, email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  });
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { userId: ownerId } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('names the insumos below the minimum that have no supplier, instead of saying there are none', async () => {
    await ingredient('Kafta', -0.16, 3);
    await ingredient('Alcatra', 16, 3);
    const res = await generate();
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain('Kafta');
    expect(error).toContain('fornecedor');
    expect(error).not.toContain('Alcatra');
    expect(error).not.toContain('Nenhum ingrediente abaixo');
  });
});
