// @ts-nocheck
/**
 * "Bad day" scenario 1, server side (owner decision 2026-09-24, offline option (a)): what a device
 * made offline reaches the server later through its outbox, which replays each request with the
 * SAME Idempotency-Key until it gets an answer. When the first attempt reached the server and only
 * the answer was lost, the replay must get the stored answer instead of adding the item, sending to
 * the kitchen, recording the withdrawal or making the counter sale a second time.
 * Routes: comanda add / change / remove item, send to kitchen, close, cash movement, counter sale.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as addItem } from '../../../app/api/comanda/sessions/[id]/items/route';
import { POST as sendToKitchen } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { PUT as updateComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { POST as cashMovement } from '../../../app/api/caixa/movimentos/route';
import { POST as quickSale } from '../../../app/api/comanda/quick-sale/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 1 (server): replaying what a device made offline', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let burger: any;
  let cheese: any;
  let register: any;
  let config: any;
  const tag = crypto.randomBytes(3).toString('hex');

  const asOwner = (ctx: any) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ctx.ownerId, email: `${ctx.ownerId}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(ctx.restaurantId);
  };
  const key = () => `k-${crypto.randomBytes(8).toString('hex')}`;
  const req = (url: string, method: string, body: any, idempotencyKey?: string) =>
    new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify(body),
    }) as any;
  const openComanda = () =>
    prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 4 } });
  const add = (sessionId: string, body: any, k?: string) =>
    addItem(req(`http://localhost/api/comanda/sessions/${sessionId}/items`, 'POST', body, k), { params: { id: sessionId } });

  const wipe = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.idempotencyRecord.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId: config.id }, { document: { configId: config.id } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId: config.id } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashMovement.deleteMany({ where: { cashRegisterId: register.id } });
    await prisma.cashRegister.update({ where: { id: register.id }, data: { expectedBalance: 100 } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    burger = await prisma.recipe.create({
      data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 },
    });
    cheese = await prisma.itemModifier.create({ data: { restaurantId: A.restaurantId, name: `Queijo ${tag}`, priceAdjustment: 3 } });
    register = await prisma.cashRegister.create({ data: { name: `Caixa ${tag}`, restaurantId: A.restaurantId, expectedBalance: 100 } });
    config = await prisma.nFeConfig.create({
      data: { restaurantId: A.restaurantId, cnpj: `8${Date.now()}`.slice(0, 14), nfeApiKey: 'k', environment: 'sandbox', autoIssueOnSale: true },
    });
  });

  afterAll(async () => {
    await wipe();
    await prisma.nFeConfig.deleteMany({ where: { id: config.id } });
    await prisma.cashRegister.deleteMany({ where: { id: register.id } });
    await prisma.itemModifier.deleteMany({ where: { id: cheese.id } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(fakeProvider).forEach((fn) => typeof fn === 'function' && fn.mockReset());
    fakeProvider.emitNFCe.mockImplementation(async () => ({ ok: true, status: 'authorized', accessKey: `35${crypto.randomBytes(21).toString('hex').replace(/\D/g, '1').slice(0, 42)}` }));
    await wipe();
    asOwner(A);
  });

  describe('comanda', () => {
    it('an item replayed with the same key is added once, and the replay gets the same answer', async () => {
      const s = await openComanda();
      const k = key();

      const first = await add(s.id, { recipeId: burger.id, quantity: 2 }, k);
      const replay = await add(s.id, { recipeId: burger.id, quantity: 2 }, k);

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
      expect((await replay.json()).id).toBe((await first.json()).id);
      expect(await prisma.orderSessionItem.count({ where: { sessionId: s.id } })).toBe(1);
    });

    it('without a key (normal online use) each request adds a line', async () => {
      const s = await openComanda();
      await add(s.id, { recipeId: burger.id });
      await add(s.id, { recipeId: burger.id });
      expect(await prisma.orderSessionItem.count({ where: { sessionId: s.id } })).toBe(2);
    });

    it('a key reused for another request is refused', async () => {
      const s = await openComanda();
      const k = key();
      await add(s.id, { recipeId: burger.id }, k);

      const res = await sendToKitchen(req(`http://localhost/api/comanda/sessions/${s.id}/send-to-kitchen`, 'POST', {}, k), { params: { id: s.id } });

      expect(res.status).toBe(422);
    });

    it('the same key in another restaurant is a different request', async () => {
      const s = await openComanda();
      const k = key();
      await add(s.id, { recipeId: burger.id }, k);
      asOwner(B);
      const res = await add(s.id, { recipeId: burger.id }, k);
      expect(res.status).toBe(404); // B cannot see A's comanda; the key did not replay A's answer
    });

    it('the modifiers chosen with the line are saved, priced by the restaurant (not the device)', async () => {
      const s = await openComanda();

      const res = await add(s.id, { recipeId: burger.id, quantity: 2, modifierIds: [cheese.id] });

      expect(res.status).toBe(201);
      const line = await prisma.orderSessionItem.findFirst({ where: { sessionId: s.id }, include: { modifiers: true } });
      expect(line.modifiers.map((m) => [m.modifierId, Number(m.priceAdjustment)])).toEqual([[cheese.id, 3]]);
      expect(Number(line.price)).toBe(30);
    });

    it('send to kitchen replayed with the same key makes one kitchen order', async () => {
      const s = await openComanda();
      await add(s.id, { recipeId: burger.id });
      const k = key();
      const send = () => sendToKitchen(req(`http://localhost/api/comanda/sessions/${s.id}/send-to-kitchen`, 'POST', {}, k), { params: { id: s.id } });

      expect((await send()).status).toBe(200);
      expect((await send()).status).toBe(200);
      expect(await prisma.order.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });

    it('a close replayed with the same key issues one note', async () => {
      const s = await openComanda();
      await add(s.id, { recipeId: burger.id });
      const k = key();
      const close = () => updateComanda(req(`http://localhost/api/comanda/sessions/${s.id}`, 'PUT', { status: 'CLOSED', paymentMethod: 'dinheiro' }, k), { params: { id: s.id } });

      await close();
      const replay = await close();

      expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
      expect(await prisma.nFeDocument.count({ where: { orderSessionId: s.id } })).toBe(1);
      expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).closedAt).not.toBeNull();
    });
  });

  describe('cash register', () => {
    it('a withdrawal replayed with the same key is recorded once', async () => {
      const k = key();
      const move = () => cashMovement(req('http://localhost/api/caixa/movimentos', 'POST', { cashRegisterId: register.id, type: 'WITHDRAWAL', amount: 40 }, k));

      expect((await move()).status).toBe(201);
      expect((await move()).status).toBe(201);
      expect(await prisma.cashMovement.count({ where: { cashRegisterId: register.id } })).toBe(1);
      expect(Number((await prisma.cashRegister.findUnique({ where: { id: register.id } })).expectedBalance)).toBe(60);
    });
  });

  describe('counter sale in one request', () => {
    const sale = (body: any, k?: string) => quickSale(req('http://localhost/api/comanda/quick-sale', 'POST', body, k));

    it('records a closed sale with its lines and issues the note', async () => {
      const clientId = `bal-${crypto.randomBytes(8).toString('hex')}`;

      const res = await sale({ clientId, items: [{ recipeId: burger.id, quantity: 2, modifierIds: [cheese.id] }], customerCPF: '123.456.789-09', paymentMethod: 'pix' }, key());
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.session.status).toBe('CLOSED');
      expect(body.nfce.nfce.status).toBe('authorized');
      expect(fakeProvider.emitNFCe.mock.calls[0][0].totalAmount).toBe(66);
      expect(fakeProvider.emitNFCe.mock.calls[0][0].paymentMethod).toBe('pix');
    });

    it('replayed (same key or not) it is recorded once', async () => {
      const clientId = `bal-${crypto.randomBytes(8).toString('hex')}`;
      const k = key();
      const body = { clientId, items: [{ recipeId: burger.id }], paymentMethod: 'dinheiro' };

      await sale(body, k);
      await sale(body, k);
      const again = await (await sale(body, key())).json();

      expect(again.alreadyRecorded).toBe(true);
      expect(await prisma.orderSession.count({ where: { id: clientId } })).toBe(1);
      expect(await prisma.orderSessionItem.count({ where: { sessionId: clientId } })).toBe(1);
      expect(await prisma.nFeDocument.count({ where: { orderSessionId: clientId } })).toBe(1);
    });

    it('a sale with an unknown item is refused and nothing is recorded', async () => {
      const clientId = `bal-${crypto.randomBytes(8).toString('hex')}`;
      const res = await sale({ clientId, items: [{ recipeId: burger.id }, { recipeId: 'does-not-exist' }] });
      expect(res.status).toBe(404);
      expect(await prisma.orderSession.count({ where: { id: clientId } })).toBe(0);
    });

    it('can send the sale to the kitchen', async () => {
      const clientId = `bal-${crypto.randomBytes(8).toString('hex')}`;
      await sale({ clientId, items: [{ recipeId: burger.id }], sendToKitchen: true });
      expect(await prisma.order.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });
  });
});
