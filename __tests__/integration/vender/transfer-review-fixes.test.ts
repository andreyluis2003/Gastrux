// @ts-nocheck
/**
 * Final review of tela Vender stage 3 (2026-10-09): what a merge or a transfer must not break
 * (refund history, one NFC-e per sale, QR orders, queued actions, stuck bills, service charge).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as MERGE } from '../../../app/api/comanda/sessions/[id]/merge/route';
import { POST as MOVE } from '../../../app/api/comanda/sessions/[id]/move-items/route';
import { POST as TRANSFER } from '../../../app/api/comanda/sessions/[id]/transfer/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { POST as QR } from '../../../app/api/public/orders/[qrToken]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('transfer and merge: review fixes', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, menuItemId: string, sec: string, configId: string;
  let n = 1;
  const table = async () => {
    const number = n++;
    const t = await prisma.table.create({ data: { restaurantId: rid, number, sectionId: sec, capacity: 4, qrToken: `rf${number}${tag}` } });
    return t;
  };
  const comanda = async (qty = 1, extra: any = {}) => {
    const t = await table();
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t.id, tableNumber: t.number, status: 'OPEN', serviceChargeEligible: true, ...extra } });
    if (qty) await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: qty } });
    return { id: s.id, table: t };
  };
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `trf-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Trf ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `RF${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pratos', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Prato', price: 50, recipeId, position: 0 } })).id;
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    configId = (await prisma.nFeConfig.create({ data: { restaurantId: rid, cnpj: `9${Date.now()}`.slice(0, 14) } })).id;
    const s = { user: { id: ownerId, email: `trf-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('I1: a comanda reopened by a manager is not merged (its refund history would mark the other one\'s payments)', async () => {
    const target = await comanda();
    const source = await comanda();
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, orderSessionId: source.id, type: 'REFUND', method: 'PIX', amountCents: 100, description: 'Reabertura da comanda: teste', createdById: ownerId } });
    expect((await MERGE(req({ sourceSessionId: source.id }), { params: { id: target.id } })).status).toBe(409);
    expect((await MERGE(req({ sourceSessionId: target.id }), { params: { id: source.id } })).status).toBe(409);
  });

  it('I2: a comanda with an NFC-e is neither merged nor has lines moved out (one note per sale)', async () => {
    const target = await comanda();
    const source = await comanda();
    await prisma.nFeDocument.create({ data: { configId, documentType: 'NFCE', documentNumber: 1, documentSeries: 1, status: 'authorized', orderSessionId: source.id } });
    expect((await MERGE(req({ sourceSessionId: source.id }), { params: { id: target.id } })).status).toBe(409);
    const [line] = await prisma.orderSessionItem.findMany({ where: { sessionId: source.id } });
    expect((await MOVE(req({ itemIds: [line.id], targetSessionId: target.id }), { params: { id: source.id } })).status).toBe(409);
  });

  it('I3: a QR order at the moment of a merge never lands on the merged (cancelled) comanda', async () => {
    const target = await comanda();
    const source = await comanda();
    await Promise.all([
      MERGE(req({ sourceSessionId: source.id }), { params: { id: target.id } }),
      QR(req({ items: [{ menuItemId, quantity: 1 }] }), { params: { qrToken: source.table.qrToken } }),
    ]);
    const orphan = await prisma.orderSessionItem.count({ where: { session: { id: source.id } } });
    expect(orphan).toBe(0);
  });

  it('I4: an action queued for a merged comanda follows it to the comanda it was merged into', async () => {
    const target = await comanda();
    const source = await comanda();
    await MERGE(req({ sourceSessionId: source.id }), { params: { id: target.id } });
    const added = await ADD(req({ menuItemId, quantity: 1 }), { params: { id: source.id } });
    expect(added.status).toBe(201);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: target.id } })).toBe(3);
    expect((await SEND(req({}), { params: { id: source.id } })).status).toBe(200);
  });

  it('a merge that leaves nothing to receive closes the bill; one that would leave it overpaid is refused', async () => {
    const target = await comanda(0, { serviceChargeWaived: true });
    const source = await comanda(2); // 100 + 10%
    await PAY(req({ payments: [{ method: 'pix', amount: '100,00' }], cashSessionId: shiftId }), { params: { id: source.id } });
    expect((await MERGE(req({ sourceSessionId: source.id }), { params: { id: target.id } })).status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: target.id } })).status).toBe('CLOSED');

    const t2 = await comanda(0, { serviceChargeWaived: true });
    const s2 = await comanda(2);
    await PAY(req({ payments: [{ method: 'pix', amount: '105,00' }], cashSessionId: shiftId }), { params: { id: s2.id } });
    expect((await MERGE(req({ sourceSessionId: s2.id }), { params: { id: t2.id } })).status).toBe(409);
  });

  it('transferring keeps the service charge rule: a WhatsApp comanda moved to a table gets no charge', async () => {
    const t = await table();
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: '5511999990000', status: 'OPEN', serviceChargeEligible: false } });
    expect((await TRANSFER(req({ tableId: t.id }), { params: { id: s.id } })).status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).serviceChargeEligible).toBe(false);
  });
});
