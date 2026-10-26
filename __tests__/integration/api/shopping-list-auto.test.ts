// @ts-nocheck
/**
 * Compras > Gerar Automaticamente: insumos below the minimum without a linked supplier were skipped in
 * silence and the answer said "Nenhum ingrediente abaixo do estoque mínimo encontrado", while Estoque showed
 * them as Crítico (found while recording the tutorial videos, 2026-10-25). Since 2026-10-26 they go in the
 * list too, without a supplier: priced at the insumo's reference cost, shown by the insumo's name, received
 * into stock like any item.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as postList } from '../../../app/api/shopping-lists/route';
import { GET as getList } from '../../../app/api/shopping-lists/[id]/route';
import { receiveShoppingList } from '../../../lib/stock/receive-shopping-list';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('Compras: automatic list', () => {
  let ownerId, rid, catId;
  const email = `sla-${tag}@gastrux.test`;
  const generate = () =>
    postList(new Request('http://x/api/shopping-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoGenerate: true }) }) as any);
  const ingredient = async (name, quantity, minimumStock, referenceCost = 0) => {
    const id = (await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: catId, code: `${name}-${tag}`, name, standardUnit: 'kg', purchaseUnit: 'kg', minimumStock, referenceCost } })).id;
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

  it('with nothing below the minimum, says so', async () => {
    await ingredient('Alcatra', 16, 3, 45);
    const res = await generate();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Nenhum ingrediente abaixo');
  });

  it('puts an insumo without supplier in the list at its reference cost, shown by its name, received into stock', async () => {
    const kafta = await ingredient('Kafta', -0.16, 3, 20);
    const res = await generate();
    expect(res.status).toBe(201);
    const list = await res.json();
    const item = list.items.find((i) => i.ingredientId === kafta);
    // 2 x minimum - current = 6.16 kg at R$ 20,00/kg
    expect([item.supplierId, item.quantity, item.estimatedCost, item.unit]).toEqual([null, 6.16, 123.2, 'kg']);
    expect(list.items.some((i) => i.ingredientId !== kafta)).toBe(false);

    const shown = await (await getList(new Request('http://x') as any, { params: { id: list.id } })).json();
    const line = shown.items.find((i) => i.id === item.id);
    expect([line.supplier, line.ingredient?.name]).toEqual([null, 'Kafta']);

    const before = Number((await prisma.stock.findFirst({ where: { ingredientId: kafta } })).currentQuantity);
    const out = await prisma.$transaction((tx) => receiveShoppingList(tx, rid, list.id, { checkedOnly: false }));
    expect([out.entered, out.skipped]).toEqual([1, []]);
    const after = Number((await prisma.stock.findFirst({ where: { ingredientId: kafta } })).currentQuantity);
    expect(after).toBeCloseTo(before + 6.16);
  });
});
