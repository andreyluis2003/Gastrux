// @ts-nocheck
/** Paying a bill from the drawer or the bank, and undoing it (spec 2026-10-18 contas a pagar §5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { openSession, closeSession } from '../../../lib/caixa/sessions';
import { createPayables, payPayable, undoPayment } from '../../../lib/payables/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const NOW = new Date('2026-10-18T15:00:00Z');

describe('contas a pagar: pay and undo', () => {
  let rid, owner, ownerId, regA, regB;
  const bill = async (amount = '120') => (await createPayables(owner, { description: `Gás ${crypto.randomBytes(2).toString('hex')}`, category: 'OTHER', amount, dueDate: '2026-10-20', mode: 'ONCE' }, NOW)).ids[0];

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `pp-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `PP ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active' } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    owner = { userId: ownerId, restaurantId: rid, role: 'OWNER' };
    regA = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa A', isDefault: true } });
    regB = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa B' } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.payable.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.cashSession.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { userId: ownerId } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('by the bank: paid, nothing in any drawer', async () => {
    const id = await bill();
    await payPayable(owner, id, { method: 'PIX', from: 'BANK', paidAt: '2026-10-18' });
    const p = await prisma.payable.findUnique({ where: { id } });
    expect(p).toMatchObject({ status: 'PAID', paidMethod: 'PIX', paidFrom: 'BANK', cashEntryId: null, paidById: ownerId });
    expect(p.paidAt.toISOString().slice(0, 10)).toBe('2026-10-18');
    expect((await payPayable(owner, id, { method: 'PIX', from: 'BANK' }).catch((e) => e)).status).toBe(409);
  });

  it('from the drawer with no open register: 409', async () => {
    const id = await bill();
    const e = await payPayable(owner, id, { method: 'CASH', from: 'DRAWER' }).catch((x) => x);
    expect(e.status).toBe(409);
    expect(e.message).toBe('Abra o caixa para pagar com dinheiro da gaveta');
  });

  it('from the drawer with one open register: an expense linked to the bill', async () => {
    const { session } = await openSession(owner, { cashRegisterId: regA.id, openingFloat: 500 });
    const id = await bill('120');
    await payPayable(owner, id, { method: 'CASH', from: 'DRAWER' });
    const p = await prisma.payable.findUnique({ where: { id } });
    const entry = await prisma.cashSessionEntry.findUnique({ where: { id: p.cashEntryId } });
    expect(entry).toMatchObject({ cashSessionId: session.id, type: 'EXPENSE', method: 'CASH', amountCents: 12000, payableId: id });
    expect(p.paidFrom).toBe('DRAWER');
  });

  it('two open registers: the request must name one', async () => {
    const { session: b } = await openSession(owner, { cashRegisterId: regB.id, openingFloat: 200 });
    const id = await bill('30');
    const e = await payPayable(owner, id, { method: 'CASH', from: 'DRAWER' }).catch((x) => x);
    expect(e.status).toBe(409);
    expect(e.message).toBe('Escolha o caixa');
    expect(e.extra.shifts.map((s) => s.registerName).sort()).toEqual(['Caixa A', 'Caixa B']);
    await payPayable(owner, id, { method: 'CASH', from: 'DRAWER', cashSessionId: b.id });
    const p = await prisma.payable.findUnique({ where: { id } });
    expect((await prisma.cashSessionEntry.findUnique({ where: { id: p.cashEntryId } })).cashSessionId).toBe(b.id);
  });

  it('two clicks at once pay once', async () => {
    const id = await bill('10');
    const res = await Promise.allSettled([payPayable(owner, id, { method: 'PIX', from: 'BANK' }), payPayable(owner, id, { method: 'PIX', from: 'BANK' })]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.find((r) => r.status === 'rejected').reason.status).toBe(409);
  });

  it('undo a drawer payment: money back to the open register, bill open again', async () => {
    const p = await prisma.payable.findFirst({ where: { restaurantId: rid, paidFrom: 'DRAWER', amountCents: 12000 } });
    expect((await undoPayment(owner, p.id, '').catch((e) => e)).status).toBe(400);
    const regAOpen = await prisma.cashSession.findFirst({ where: { cashRegisterId: regA.id, status: 'OPEN' } });
    await undoPayment(owner, p.id, 'paguei errado', regAOpen.id);
    const after = await prisma.payable.findUnique({ where: { id: p.id } });
    expect(after).toMatchObject({ status: 'OPEN', paidAt: null, paidFrom: null, cashEntryId: null });
    const back = await prisma.cashSessionEntry.findFirst({ where: { cashSessionId: regAOpen.id, type: 'ADJUSTMENT', direction: 'IN' } });
    expect(back).toMatchObject({ amountCents: 12000, method: 'CASH' });
  });

  it('two undos at once give the money back once (final review I-1)', async () => {
    const shift = await prisma.cashSession.findFirst({ where: { cashRegisterId: regA.id, status: 'OPEN' } });
    const id = await bill('77');
    await payPayable(owner, id, { method: 'CASH', from: 'DRAWER', cashSessionId: shift.id });
    const p = await prisma.payable.findUnique({ where: { id } });
    const results = await Promise.allSettled([undoPayment(owner, id, 'duplo clique', shift.id), undoPayment(owner, id, 'duplo clique', shift.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const back = await prisma.cashSessionEntry.count({ where: { cashSessionId: shift.id, type: 'ADJUSTMENT', direction: 'IN', description: { contains: p.description } } });
    expect(back).toBe(1);
    expect((await prisma.payable.findUnique({ where: { id } })).status).toBe('OPEN');
  });

  it('undo a bank payment needs no register', async () => {
    const p = await prisma.payable.findFirst({ where: { restaurantId: rid, paidFrom: 'BANK', status: 'PAID' } });
    await undoPayment(owner, p.id, 'estornado no banco');
    expect((await prisma.payable.findUnique({ where: { id: p.id } })).status).toBe('OPEN');
  });
});
