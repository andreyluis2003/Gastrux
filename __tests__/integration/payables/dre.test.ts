// @ts-nocheck
/**
 * The DRE by competence with contas a pagar (spec 2026-10-18 contas a pagar §5): rent, taxes and services count in
 * their month; merchandise (CMV) and utility bills (own line) never twice; a drawer payment of a bill counts once;
 * payroll bills replace the estimate from the staff salaries.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { computeDre } from '../../../lib/finance/dre';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const m = (ym) => new Date(`${ym}-01T00:00:00.000Z`);
const d = (s) => new Date(`${s}T00:00:00.000Z`);

describe('DRE with contas a pagar', () => {
  let rid, ownerId, shiftId, staffUserId;
  const payable = (data) => prisma.payable.create({ data: { restaurantId: rid, description: data.category, amountCents: 0, competenceMonth: m('2026-10'), dueDate: d('2026-10-10'), createdById: ownerId, ...data } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `pdre-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `PDRE ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active' } })).id;
    staffUserId = (await prisma.user.create({ data: { email: `ze-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } })).id;
    await prisma.staffMember.create({ data: { restaurantId: rid, userId: staffUserId, role: 'COOK', status: 'ACTIVE', basesalary: 2000 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN', openedAt: d('2026-10-02') } })).id;
    const rent = await payable({ category: 'RENT', amountCents: 300000, status: 'PAID', paidFrom: 'DRAWER' });
    await payable({ category: 'TAXES', amountCents: 50000 });
    await payable({ category: 'MERCHANDISE', amountCents: 400000 });
    const acc = await prisma.utilityAccount.create({ data: { restaurantId: rid, kind: 'ENERGY', name: 'Energia' } });
    const bill = await prisma.utilityBill.create({ data: { accountId: acc.id, restaurantId: rid, referenceMonth: m('2026-10'), amountCents: 80000, createdById: ownerId } });
    await payable({ category: 'UTILITIES', amountCents: 80000, utilityBillId: bill.id, source: 'UTILITY' });
    await payable({ category: 'OTHER', amountCents: 99900, status: 'CANCELED' });
    await payable({ category: 'OTHER', amountCents: 20000, competenceMonth: m('2026-09') });
    const at = d('2026-10-15');
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'EXPENSE', method: 'CASH', amountCents: 15000, category: 'outros', createdById: ownerId, createdAt: at } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'EXPENSE', method: 'CASH', amountCents: 300000, category: 'outros', createdById: ownerId, createdAt: at, payableId: rent.id } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.payable.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.cashSession.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [ownerId, staffUserId] } } }); } catch {}
  });

  it('October: rent and taxes once; merchandise and utilities not again; the drawer payment of the rent not twice', async () => {
    const { dre } = await computeDre(rid, '2026-10-01', '2026-10-31');
    expect(dre.despesasOperacionais.contasAPagar).toBe(3500);
    expect(dre.despesasOperacionais.operacional).toBe(150);
    expect(dre.despesasOperacionais.contasConsumo).toBe(800);
    expect(dre.despesasOperacionais.pessoal).toBeCloseTo(2000 * 31 / 30, 1); // the estimate counts October as 31/30 of a month
    expect(dre.pessoalOrigem).toBe('estimativa');
  });

  it('payroll bills of the month replace the staff estimate', async () => {
    await payable({ category: 'PAYROLL', amountCents: 250000 });
    const { dre } = await computeDre(rid, '2026-10-01', '2026-10-31');
    expect(dre.despesasOperacionais.pessoal).toBe(2500);
    expect(dre.pessoalOrigem).toBe('contas');
  });

  it('a partial period says the bills count by the whole month (minor M-7)', async () => {
    expect((await computeDre(rid, '2026-10-01', '2026-10-15')).dre.contasMesInteiro).toBe(true);
    expect((await computeDre(rid, '2026-10-01', '2026-10-31')).dre.contasMesInteiro).toBe(false);
  });

  it('September and October with payroll only in October: September keeps its estimate (final review I-6)', async () => {
    const { dre } = await computeDre(rid, '2026-09-01', '2026-10-31');
    expect(dre.despesasOperacionais.pessoal).toBeCloseTo(2000 + 2500, 1);
    expect(dre.pessoalOrigem).toBe('misto');
  });
});
