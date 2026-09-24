// @ts-nocheck
/**
 * "Bad day" scenario 9 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * a new operator (cashier / waiter) makes a mistake, or tries something only a manager should do.
 * Each case states the DESIRED behaviour (market practice: item removal before the kitchen is free
 * but logged; cancelling what the kitchen already has, cancelling a bill or a fiscal note, changing
 * prices, refunds and staff roles need a manager of THIS restaurant, with a reason, and leave a trace;
 * a person's role is the role they have in the restaurant they are working in).
 * Real getCurrentRestaurantId / getRestaurantContext are used (only the session is simulated).
 * A case that documents a known gap is written with `it.failing` (the suite stays green and a case
 * flips to a failure the day its gap is fixed). Gaps, by priority:
 *   P0 security  W9   /api/caixa/movimentos finds the register by id only: anyone signed in can
 *                     post a withdrawal to ANOTHER restaurant's cash register
 *   P0 security  W8   a manager can create an OWNER or a platform ADMIN; every new staff user gets
 *                     the fixed password "temp123"
 *   P0 security  W7   role checks use the GLOBAL User.role from the session: the owner of another
 *                     restaurant who is only a CASHIER here acts as an owner here (refunds...)
 *   P1 security  W10  getRestaurantContext (safeHandler routes, stock count) never checks the
 *                     membership: a removed staff member keeps access until the session ends
 *   P1 records   W1   any role cancels a whole comanda, with no reason and no trace
 *   P1 records   W3   any role deletes (hard delete) or reduces an item the kitchen already has
 *   P1 records   W2   removing an item leaves no trace
 *   P1           W5   any role cancels an authorised NFC-e at SEFAZ
 *   P1           W6   any role changes a dish price (no audit, negative accepted)
 *   P2           W4   a MANAGER cannot cancel a kitchen order (only OWNER)
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { DELETE as cancelComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { PUT as updateItem, DELETE as removeItem } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';
import { DELETE as cancelKitchenOrder } from '../../../app/api/kds/orders/[id]/route';
import { POST as cancelNote } from '../../../app/api/nfe/documents/[id]/cancel/route';
import { PUT as setSellingPrice } from '../../../app/api/recipes/[id]/selling-price/route';
import { POST as refund } from '../../../app/api/pagamentos/unified/refund/route';
import { POST as createStaff } from '../../../app/api/admin/staff/route';
import { POST as cashMovement } from '../../../app/api/caixa/movimentos/route';
import { POST as saveCount } from '../../../app/api/stock-count/route';
import { POST as saveFiscalConfig } from '../../../app/api/admin/fiscal/config/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 9: a new operator makes a mistake', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let cashier: any;
  let manager: any;
  let ownerElsewhere: any; // owns another restaurant, only a CASHIER at A
  let recipe: any;
  let ingredient: any;
  let registerA: any;
  let configA: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const createdUsers: string[] = [];

  const as = (user: any) =>
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: user.id, email: user.email, role: user.role } });

  const req = (url: string, method: string, body?: any) =>
    new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) as any;

  const mkUser = async (role: string, restaurantRole: string, restaurantId: string, currentRestaurantId = restaurantId) => {
    const user = await prisma.user.create({
      data: { email: `${role.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}@bad-day9.test`, name: `${role} ${tag}`, password: 'x', role, currentRestaurantId, active: true },
    });
    createdUsers.push(user.id);
    await prisma.restaurantUser.create({ data: { restaurantId, userId: user.id, role: restaurantRole, isActive: true } });
    return user;
  };

  const mkComanda = async (sentToKitchen = false) => {
    const s = await prisma.orderSession.create({
      data: { restaurantId: A.restaurantId, userId: A.ownerId, status: sentToKitchen ? 'SENT_TO_KITCHEN' : 'OPEN', tableNumber: 3 },
    });
    const item = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    if (sentToKitchen) {
      await prisma.orderSession.update({ where: { id: s.id }, data: { sentToKitchenAt: new Date(Date.now() + 1000) } });
    }
    return { s, item };
  };

  const auditFor = (userId: string) => prisma.auditLog.findMany({ where: { userId } });

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    cashier = await mkUser('CASHIER', 'CASHIER', A.restaurantId);
    manager = await mkUser('MANAGER', 'MANAGER', A.restaurantId);
    ownerElsewhere = await mkUser('OWNER', 'CASHIER', A.restaurantId);
    recipe = await prisma.recipe.create({
      data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Prato ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 },
    });
    const category = await prisma.ingredientCategory.create({ data: { restaurantId: A.restaurantId, name: `Cat ${tag}` } });
    ingredient = await prisma.ingredient.create({
      data: { restaurantId: A.restaurantId, code: `I-${tag}`, name: `Arroz ${tag}`, categoryId: category.id, standardUnit: 'kg', purchaseUnit: 'kg' },
    });
    await prisma.stock.create({ data: { restaurantId: A.restaurantId, ingredientId: ingredient.id, currentQuantity: 10 } });
    registerA = await prisma.cashRegister.create({ data: { name: `Caixa ${tag}`, restaurantId: A.restaurantId } });
    configA = await prisma.nFeConfig.create({
      data: { restaurantId: A.restaurantId, cnpj: `9${Date.now()}`.slice(0, 14), nfeApiKey: 'k', environment: 'sandbox' },
    });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.cashMovement.deleteMany({ where: { cashRegisterId: registerA.id } });
    await prisma.cashRegister.deleteMany({ where: { id: registerA.id } });
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId: configA.id }, { document: { configId: configA.id } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId: configA.id } });
    await prisma.nFeConfig.deleteMany({ where: { id: configA.id } });
    await prisma.stockMovement.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.wasteLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ restaurantId: { in: ids } }, { userId: { in: createdUsers } }] } });
    await prisma.staffMember.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.user.deleteMany({ where: { OR: [{ id: { in: createdUsers } }, { email: { endsWith: '@bad-day9-new.test' } }] } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(fakeProvider).forEach((fn) => typeof fn === 'function' && fn.mockReset());
  });

  describe('W1-W3: the comanda', () => {
    it.failing('a cashier cannot cancel a whole comanda (needs a manager)', async () => {
      const { s } = await mkComanda();
      as(cashier);
      const res = await cancelComanda(req(`http://localhost/api/comanda/sessions/${s.id}`, 'DELETE', { reason: 'cliente desistiu' }), { params: { id: s.id } });
      expect(res.status).toBe(403);
      expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('OPEN');
    });

    it.failing('a manager cancels a comanda with a reason, and it leaves a trace', async () => {
      const { s } = await mkComanda();
      as(manager);
      const res = await cancelComanda(req(`http://localhost/api/comanda/sessions/${s.id}`, 'DELETE', { reason: 'cliente desistiu' }), { params: { id: s.id } });
      expect(res.status).toBe(200);
      const logs = await auditFor(manager.id);
      expect(logs.some((l) => l.entityId === s.id && l.changes.includes('cliente desistiu'))).toBe(true);
    });

    it.failing('a cashier removes an item the kitchen does not have yet, and it leaves a trace', async () => {
      const { s, item } = await mkComanda(false);
      as(cashier);
      const res = await removeItem(req(`http://localhost/api/comanda/sessions/${s.id}/items/${item.id}`, 'DELETE'), { params: { id: s.id, itemId: item.id } });
      expect(res.status).toBe(200);
      expect((await auditFor(cashier.id)).some((l) => l.entityId === item.id || l.changes.includes(item.id))).toBe(true);
    });

    it.failing('a cashier cannot remove an item the kitchen already has', async () => {
      const { s, item } = await mkComanda(true);
      as(cashier);
      const res = await removeItem(req(`http://localhost/api/comanda/sessions/${s.id}/items/${item.id}`, 'DELETE'), { params: { id: s.id, itemId: item.id } });
      expect(res.status).toBe(403);
      expect(await prisma.orderSessionItem.findUnique({ where: { id: item.id } })).not.toBeNull();
    });

    it.failing('a cashier cannot reduce the quantity of an item the kitchen already has', async () => {
      const { s, item } = await mkComanda(true);
      as(cashier);
      const res = await updateItem(req(`http://localhost/api/comanda/sessions/${s.id}/items/${item.id}`, 'PUT', { quantity: 1 }), { params: { id: s.id, itemId: item.id } });
      expect(res.status).toBe(403);
      expect((await prisma.orderSessionItem.findUnique({ where: { id: item.id } })).quantity).toBe(2);
    });

    it('a cashier can raise the quantity of a line (a new order for the kitchen, not a cancellation)', async () => {
      const { s, item } = await mkComanda(false);
      as(cashier);
      const res = await updateItem(req(`http://localhost/api/comanda/sessions/${s.id}/items/${item.id}`, 'PUT', { quantity: 3 }), { params: { id: s.id, itemId: item.id } });
      expect(res.status).toBe(200);
    });
  });

  describe('W4 / W5: kitchen order and fiscal note', () => {
    const mkOrder = () =>
      prisma.order.create({ data: { restaurantId: A.restaurantId, orderNumber: `W4-${crypto.randomBytes(4).toString('hex')}`, orderType: 'DINE_IN', status: 'PENDING', total: 10 } });

    it('a cashier cannot cancel a kitchen order', async () => {
      const order = await mkOrder();
      as(cashier);
      const res = await cancelKitchenOrder(req(`http://localhost/api/kds/orders/${order.id}`, 'DELETE'), { params: { id: order.id } });
      expect(res.status).toBe(401);
    });

    it.failing('a manager can cancel a kitchen order', async () => {
      const order = await mkOrder();
      as(manager);
      const res = await cancelKitchenOrder(req(`http://localhost/api/kds/orders/${order.id}`, 'DELETE'), { params: { id: order.id } });
      expect(res.status).toBe(200);
    });

    it.failing('a cashier cannot cancel an authorised NFC-e', async () => {
      const doc = await prisma.nFeDocument.create({
        data: { configId: configA.id, documentType: 'NFCe', documentSeries: 1, documentNumber: Number(`9${Date.now() % 100000}`), status: 'authorized', providerRef: `ref-${tag}`, authorizedAt: new Date() },
      });
      fakeProvider.cancelNFCe.mockResolvedValue({ ok: true, status: 'cancelled' });
      as(cashier);
      const res = await cancelNote(req(`http://localhost/api/nfe/documents/${doc.id}/cancel`, 'POST', { justificativa: 'Cancelamento por engano do operador' }), { params: { id: doc.id } });
      expect(res.status).toBe(403);
      expect(fakeProvider.cancelNFCe).not.toHaveBeenCalled();
    });
  });

  describe('W6: prices', () => {
    const setPrice = (price: any) =>
      setSellingPrice(req(`http://localhost/api/recipes/${recipe.id}/selling-price`, 'PUT', { sellingPrice: price }), { params: { id: recipe.id } });

    it.failing('a cashier cannot change a dish price', async () => {
      as(cashier);
      const res = await setPrice(1);
      expect(res.status).toBe(403);
      expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).sellingPrice).toBe(30);
    });

    it.failing('a manager changes a price and it leaves a trace with the old and new price', async () => {
      as(manager);
      const res = await setPrice(32);
      expect(res.status).toBe(200);
      const logs = await auditFor(manager.id);
      expect(logs.some((l) => l.entityId === recipe.id && l.changes.includes('30') && l.changes.includes('32'))).toBe(true);
      await prisma.recipe.update({ where: { id: recipe.id }, data: { sellingPrice: 30 } });
    });

    it.failing('a negative price is refused', async () => {
      as(manager);
      const res = await setPrice(-5);
      expect(res.status).toBe(400);
      expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).sellingPrice).toBe(30);
    });
  });

  describe('W7 / W10: the role that counts is the role in THIS restaurant', () => {
    it.failing('the owner of another restaurant who is only a cashier here cannot refund', async () => {
      as(ownerElsewhere);
      const res = await refund(req('http://localhost/api/pagamentos/unified/refund', 'POST', { paymentId: 'any', reason: 'engano' }));
      expect(res.status).toBe(403);
    });

    it('a cashier cannot change the fiscal settings', async () => {
      as(cashier);
      const res = await saveFiscalConfig(req('http://localhost/api/admin/fiscal/config', 'POST', { autoIssueOnSale: false }));
      expect([401, 403]).toContain(res.status);
    });

    it.failing('a removed staff member cannot save a stock count', async () => {
      const removed = await mkUser('CASHIER', 'CASHIER', A.restaurantId);
      await prisma.restaurantUser.updateMany({ where: { userId: removed.id }, data: { isActive: false } });
      as(removed);
      const res = await saveCount(req('http://localhost/api/stock-count', 'POST', { counts: [{ ingredientId: ingredient.id, countedQuantity: 0 }] }));
      expect([401, 403]).toContain(res.status);
      expect((await prisma.stock.findUnique({ where: { ingredientId: ingredient.id } })).currentQuantity).toBe(10);
    });

    it('a cashier stock count is applied and records who counted', async () => {
      as(cashier);
      const res = await saveCount(req('http://localhost/api/stock-count', 'POST', { counts: [{ ingredientId: ingredient.id, countedQuantity: 10 }] }));
      expect(res.status).toBe(200);
      expect((await auditFor(cashier.id)).some((l) => l.entityType === 'StockCount')).toBe(true);
    });
  });

  describe('W8: staff', () => {
    const newStaff = (staffRole: string) =>
      createStaff(req('http://localhost/api/admin/staff', 'POST', { name: 'Novo', email: `n-${crypto.randomBytes(4).toString('hex')}@bad-day9-new.test`, staffRole }));

    it('a cashier cannot create staff', async () => {
      as(cashier);
      expect((await newStaff('COOK')).status).toBe(403);
    });

    it.failing('a manager cannot create an owner or a platform admin', async () => {
      as(manager);
      expect((await newStaff('OWNER')).status).toBe(403);
      expect((await newStaff('ADMIN')).status).toBe(403);
    });

    it.failing('a new staff user does not get the fixed password "temp123"', async () => {
      as(manager);
      const res = await newStaff('CASHIER');
      const { member } = await res.json();
      const user = await prisma.user.findUnique({ where: { id: member.userId } });
      const bcrypt = await import('bcryptjs');
      expect(await bcrypt.compare('temp123', user.password)).toBe(false);
    });
  });

  describe('W9: cash register', () => {
    const move = (registerId: string) =>
      cashMovement(req('http://localhost/api/caixa/movimentos', 'POST', { cashRegisterId: registerId, type: 'WITHDRAWAL', amount: 50, description: 'sangria' }));

    it('a cashier withdrawal (sangria) in its own register records who made it', async () => {
      as(cashier);
      const res = await move(registerA.id);
      expect(res.status).toBe(201);
      expect((await res.json()).createdBy).toBe(cashier.id);
    });

    it.failing("a user of another restaurant cannot post to this restaurant's register", async () => {
      const before = (await prisma.cashRegister.findUnique({ where: { id: registerA.id } })).expectedBalance;
      const outsider = await mkUser('OWNER', 'OWNER', B.restaurantId);
      as(outsider);
      const res = await move(registerA.id);
      expect(res.status).toBe(404);
      expect(Number((await prisma.cashRegister.findUnique({ where: { id: registerA.id } })).expectedBalance)).toBe(Number(before));
    });
  });
});
