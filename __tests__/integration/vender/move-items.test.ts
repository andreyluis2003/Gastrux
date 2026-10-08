// @ts-nocheck
/** Moving some lines to another table or comanda (spec 2026-10-07, 4.4 and 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as MOVE } from '../../../app/api/comanda/sessions/[id]/move-items/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('move items', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, sec: string;
  let n = 1;
  const table = async () => (await prisma.table.create({ data: { restaurantId: rid, number: n++, sectionId: sec, capacity: 4, qrToken: `mv${n}${tag}` } })).id;
  const comanda = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: await table(), status: 'OPEN', serviceChargeEligible: true } });
    const a = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 1, sentAt: new Date() } });
    const b = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 20, quantity: 1 } });
    return { id: s.id, sentLine: a.id, newLine: b.id };
  };
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `mv-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Mv ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `MV${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `mv-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('to a free table: a comanda is opened there; a sent line stays sent and is never sent again', async () => {
    const src = await comanda();
    const free = await table();
    const res = await MOVE(req({ itemIds: [src.sentLine], tableId: free }), { params: { id: src.id } });
    expect(res.status).toBe(200);
    const { sessionId } = await res.json();
    const moved = await prisma.orderSessionItem.findUnique({ where: { id: src.sentLine } });
    expect([moved.sessionId, !!moved.sentAt]).toEqual([sessionId, true]);
    const send = await SEND(req({}), { params: { id: sessionId } });
    expect(send.status).toBe(400); // nothing new for the kitchen
  });

  it('to another open comanda', async () => {
    const src = await comanda();
    const dst = await comanda();
    const res = await MOVE(req({ itemIds: [src.newLine], targetSessionId: dst.id }), { params: { id: src.id } });
    expect(res.status).toBe(200);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: dst.id } })).toBe(3);
  });

  it('lines of another comanda, or out of a bill with payments, are refused', async () => {
    const a = await comanda();
    const b = await comanda();
    expect((await MOVE(req({ itemIds: [b.newLine], targetSessionId: b.id }), { params: { id: a.id } })).status).toBe(404);
    await PAY(req({ payments: [{ method: 'pix', amount: '10,00' }], cashSessionId: shiftId }), { params: { id: a.id } });
    expect((await MOVE(req({ itemIds: [a.newLine], targetSessionId: b.id }), { params: { id: a.id } })).status).toBe(409);
  });
});
