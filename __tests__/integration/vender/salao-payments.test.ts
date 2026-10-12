// @ts-nocheck
/** Pay at the table, stage 4: the map shows what was paid and who called the waiter (spec 2026-10-10 §5.2) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { loadSalao } from '../../../lib/vender/salao';
import { applyTablePayment } from '../../../lib/comanda/table-payment';
import { recordBillPayment } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('the map: paid so far and waiter calls', () => {
  let rid, ownerId, recipe, t1, t2, t3, shift;

  const open = (tableId, data = {}) => prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeWaived: true, ...data } });
  const tile = async (tableId) => (await loadSalao(rid)).tables.find((t) => t.id === tableId).session;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `sp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SP ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    [t1, t2, t3] = await Promise.all([1, 2, 3].map(async (n) => (await prisma.table.create({ data: { restaurantId: rid, number: n, sectionId: sec.id, capacity: 4, qrToken: `sp${n}${tag}` } })).id));
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: `Caixa ${tag}` } });
    shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0 } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('no payment, no paid line: the tile is as before', async () => {
    const s = await open(t1);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    expect(await tile(t1)).toMatchObject({ paidCents: 0, billTotalCents: null, waiterCalledAt: null });
  });

  it('cash and phone together: paid is their sum, of the bill total', async () => {
    const s = await open(t2);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 3 } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 2000, orderSessionId: s.id, createdById: ownerId } });
    const p = await prisma.payment.create({ data: { restaurantId: rid, gateway: 'MERCADO_PAGO_CONNECT', method: 'PIX', status: 'APPROVED', amount: 30, orderSessionId: s.id } });
    await applyTablePayment(rid, p.id);
    expect(await tile(t2)).toMatchObject({ paidCents: 5000, billTotalCents: 9000 });
  });

  it('a table that called the waiter shows when; a payment clears it', async () => {
    const at = new Date(Date.now() - 3 * 60_000);
    const s = await open(t3, { payAtWaiterRequestedAt: at });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    expect((await tile(t3)).waiterCalledAt).toBe(at.toISOString());
    const p = await prisma.payment.create({ data: { restaurantId: rid, gateway: 'MERCADO_PAGO_CONNECT', method: 'PIX', status: 'APPROVED', amount: 10, orderSessionId: s.id } });
    await applyTablePayment(rid, p.id);
    expect(await tile(t3)).toMatchObject({ waiterCalledAt: null, paidCents: 1000, billTotalCents: 6000 });
  });

  it('a payment recorded by the staff answers the waiter call too', async () => {
    const sec = await prisma.tableSection.findFirst({ where: { restaurantId: rid } });
    const tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 4, sectionId: sec.id, capacity: 4, qrToken: `sp4${tag}` } })).id;
    const s = await open(tableId, { payAtWaiterRequestedAt: new Date() });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    await recordBillPayment({ userId: ownerId, restaurantId: rid, role: 'OWNER' }, s.id, { payments: [{ method: 'dinheiro', amount: '10,00' }], cashSessionId: shift.id });
    expect(await tile(tableId)).toMatchObject({ waiterCalledAt: null, paidCents: 1000 });
  });
});
