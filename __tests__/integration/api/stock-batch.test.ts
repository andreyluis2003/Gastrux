// @ts-nocheck
/**
 * Estoque for a new account and the batch entry (2026-10-18 UX research, proposal 3): every active insumo shows,
 * with zero when nothing came in yet; one screen takes the quantity and the cost of many insumos at once.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { stockPositions } from '../../../lib/stock/positions';
import { batchEntry } from '../../../lib/stock/batch-entry';
import { POST as BATCH } from '../../../app/api/stock/batch-entry/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('estoque: every insumo and the batch entry', () => {
  let rid, other, owner, cook, member, tomate, cebola, sal, velho, alheio;
  const as = (u) => {
    const s = { user: { id: u.id, email: u.email, role: u.role }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const post = (body) => BATCH(new NextRequest('http://x/api/stock/batch-entry', { method: 'POST', body: JSON.stringify(body) }));

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `sb-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `SB ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: true } })).id;
    other = (await prisma.restaurant.create({ data: { name: `SB2 ${tag}`, ownerId: o.id, status: 'ACTIVE', isInternal: true } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const c = await prisma.user.create({ data: { email: `sb-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    cook = { id: c.id, email: c.email, role: 'COOK' };
    member = { userId: o.id, restaurantId: rid, role: 'OWNER' };
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Hortifruti ${tag}` } });
    const ing = (restaurantId, name, extra = {}) => prisma.ingredient.create({ data: { restaurantId, code: `${name.slice(0, 3)}${crypto.randomBytes(3).toString('hex')}`, name, categoryId: restaurantId === rid ? cat.id : undefined, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 5, minimumStock: 0, ...extra } });
    tomate = await ing(rid, 'Tomate', { minimumStock: 4 });
    cebola = await ing(rid, 'Cebola');
    sal = await ing(rid, 'Sal');
    velho = await ing(rid, 'Velho', { active: false });
    const cat2 = await prisma.ingredientCategory.create({ data: { restaurantId: other, name: `Outra ${tag}` } });
    alheio = await prisma.ingredient.create({ data: { restaurantId: other, code: `ALH${tag}`, name: 'Alheio', categoryId: cat2.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 1, minimumStock: 0 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: sal.id, currentQuantity: 2 } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.stockMovement.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    try { await prisma.stock.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    try { await prisma.ingredient.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    try { await prisma.ingredientCategory.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { userId: { in: [owner.id, cook.id] } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, other] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } }); } catch {}
  });

  it('Estoque lists every active insumo of this restaurant, zero when nothing came in yet', async () => {
    const rows = await stockPositions(rid);
    expect(rows.map((r) => [r.name, r.quantity, r.hasStock, r.status])).toEqual([
      ['Cebola', 0, false, 'OK'],
      ['Sal', 2, true, 'OK'],
      ['Tomate', 0, false, 'CRITICAL'],
    ]);
  });

  it('batch entry: several insumos at once, the cost per unit, blank lines ignored, the first entry creates the stock', async () => {
    const out = await batchEntry(member, {
      batchId: `b1-${tag}`,
      items: [
        { ingredientId: tomate.id, quantity: '5,5', unitCost: '6,90' },
        { ingredientId: sal.id, quantity: '1' },
        { ingredientId: cebola.id, quantity: '' },
      ],
    });
    expect(out).toEqual({ entered: 2 });
    const pos = Object.fromEntries((await stockPositions(rid)).map((r) => [r.name, r]));
    expect(pos.Tomate).toMatchObject({ quantity: 5.5, hasStock: true, status: 'OK' });
    expect(pos.Sal.quantity).toBe(3);
    expect((await prisma.ingredient.findUnique({ where: { id: tomate.id } })).referenceCost).toBeCloseTo(6.9);
    expect((await prisma.ingredient.findUnique({ where: { id: sal.id } })).referenceCost).toBe(5);
    const mv = await prisma.stockMovement.findMany({ where: { restaurantId: rid, movementType: 'ENTRY' } });
    expect(mv.map((m) => m.reason)).toEqual(['Entrada em lote', 'Entrada em lote']);
  });

  it('the same batch sent twice (double tap, retry) enters once', async () => {
    expect(await batchEntry(member, { batchId: `b1-${tag}`, items: [{ ingredientId: tomate.id, quantity: '5,5', unitCost: '6,90' }] })).toEqual({ entered: 0 });
    expect((await prisma.stock.findFirst({ where: { restaurantId: rid, ingredientId: tomate.id } })).currentQuantity).toBe(5.5);
  });

  it('a wrong quantity names the insumo and writes nothing; another restaurant\'s insumo is refused', async () => {
    const bad = await batchEntry(member, { batchId: `b2-${tag}`, items: [{ ingredientId: cebola.id, quantity: '2' }, { ingredientId: sal.id, quantity: 'abc' }] }).catch((e) => e);
    expect(bad).toMatchObject({ status: 400, message: 'Quantidade inválida em Sal' });
    expect(await prisma.stock.findFirst({ where: { restaurantId: rid, ingredientId: cebola.id } })).toBeNull();
    const cross = await batchEntry(member, { batchId: `b3-${tag}`, items: [{ ingredientId: alheio.id, quantity: '1' }] }).catch((e) => e);
    expect(cross.status).toBe(404);
    const none = await batchEntry(member, { batchId: `b4-${tag}`, items: [{ ingredientId: cebola.id, quantity: '' }] }).catch((e) => e);
    expect(none).toMatchObject({ status: 400, message: 'Informe a quantidade de pelo menos um insumo' });
    const inactive = await batchEntry(member, { batchId: `b5-${tag}`, items: [{ ingredientId: velho.id, quantity: '1' }] }).catch((e) => e);
    expect(inactive.status).toBe(404);
  });

  it('route: the owner enters; the cook cannot', async () => {
    as(owner);
    expect((await post({ batchId: `r1-${tag}`, items: [{ ingredientId: cebola.id, quantity: '3' }] })).status).toBe(201);
    as(cook);
    expect((await post({ batchId: `r2-${tag}`, items: [{ ingredientId: cebola.id, quantity: '3' }] })).status).toBe(403);
    expect((await prisma.stock.findFirst({ where: { restaurantId: rid, ingredientId: cebola.id } })).currentQuantity).toBe(3);
  });
});
