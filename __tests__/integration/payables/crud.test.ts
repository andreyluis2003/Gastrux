// @ts-nocheck
/** Contas a pagar: create (once, installments, series), list with summary, edit, cancel, access (spec 2026-10-18 §5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST, POST as CREATE } from '../../../app/api/payables/route';
import { PATCH as EDIT } from '../../../app/api/payables/[id]/route';
import { createPayables, listPayables, editPayable, cancelPayable } from '../../../lib/payables/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const NOW = new Date('2026-10-18T15:00:00Z');
const day = (d) => d.toISOString().slice(0, 10);
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
let seq = 0;

async function setup(tier) {
  const o = await prisma.user.create({ data: { email: `pay-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Pay ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active' } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
  const c = await prisma.user.create({ data: { email: `pay-c-${seq++}-${tag}@gastrux.test`, name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
  return {
    rid,
    member: { userId: o.id, restaurantId: rid, role: 'OWNER' },
    ownerUser: { id: o.id, email: o.email, role: 'OWNER' },
    cashier: { id: c.id, email: c.email, role: 'CASHIER' },
    userIds: [o.id, c.id],
  };
}

describe('contas a pagar: create, list, edit, cancel', () => {
  let b, p;
  beforeAll(async () => { b = await setup('business'); p = await setup('pro'); }, 60000);
  afterAll(async () => {
    for (const x of [b, p]) {
      try { await prisma.payable.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.payableSeries.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { userId: { in: x.userIds } } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });

  it('once: pt-BR amount, competence defaults to the due month', async () => {
    const { ids } = await createPayables(b.member, { description: 'Contador', category: 'SERVICES', amount: '1.240,50', dueDate: '2026-11-05', mode: 'ONCE' }, NOW);
    const row = await prisma.payable.findUnique({ where: { id: ids[0] } });
    expect(row).toMatchObject({ amountCents: 124050, status: 'OPEN', source: 'MANUAL', category: 'SERVICES' });
    expect(day(row.competenceMonth)).toBe('2026-11-01');
    expect(day(row.dueDate)).toBe('2026-11-05');
  });

  it('installments: equal parts, cents on the last, monthly dates, k/n names', async () => {
    const { ids } = await createPayables(b.member, { description: 'Freezer', category: 'OTHER', amount: '1000', dueDate: '2026-12-31', mode: 'INSTALLMENTS', installments: 3 }, NOW);
    const rows = await prisma.payable.findMany({ where: { id: { in: ids } }, orderBy: { installmentNumber: 'asc' } });
    expect(rows.map((r) => r.amountCents)).toEqual([33333, 33333, 33334]);
    expect(rows.map((r) => day(r.dueDate))).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
    expect(rows.map((r) => r.description)).toEqual(['Freezer 1/3', 'Freezer 2/3', 'Freezer 3/3']);
    expect(new Set(rows.map((r) => r.installmentGroup)).size).toBe(1);
    expect((await createPayables(b.member, { description: 'X', category: 'OTHER', amount: '10', dueDate: '2026-11-01', mode: 'INSTALLMENTS', installments: 25 }, NOW).catch((e) => e)).status).toBe(400);
  });

  it('series (Business): the current month and the next two, never twice', async () => {
    const { ids } = await createPayables(b.member, { description: 'Aluguel', category: 'RENT', amount: '3000', dueDate: '2026-10-10', mode: 'SERIES' }, NOW);
    expect(ids).toHaveLength(3);
    const rows = await prisma.payable.findMany({ where: { id: { in: ids } }, orderBy: { competenceMonth: 'asc' } });
    expect(rows.map((r) => day(r.dueDate))).toEqual(['2026-10-10', '2026-11-10', '2026-12-10']);
    expect(rows.every((r) => r.source === 'SERIES' && r.seriesId === rows[0].seriesId)).toBe(true);
    await listPayables(b.member, {}, NOW);
    await listPayables(b.member, {}, NOW);
    expect(await prisma.payable.count({ where: { seriesId: rows[0].seriesId } })).toBe(3);
  });

  it('a series that starts next month never creates a bill for this month', async () => {
    const { ids } = await createPayables(b.member, { description: 'Internet', category: 'SERVICES', amount: '150', dueDate: '2026-11-08', mode: 'SERIES' }, NOW);
    const rows = await prisma.payable.findMany({ where: { id: { in: ids } }, orderBy: { competenceMonth: 'asc' } });
    expect(rows.map((r) => day(r.dueDate))).toEqual(['2026-11-08', '2026-12-08']);
  });

  it('series is Business: Pro gets 403', async () => {
    const e = await createPayables(p.member, { description: 'Aluguel', category: 'RENT', amount: '3000', dueDate: '2026-10-10', mode: 'SERIES' }, NOW).catch((x) => x);
    expect(e.status).toBe(403);
    expect(e.message).toBe('Repetir todo mês é do plano Business');
  });

  it('edit "esta e as próximas" changes the series and the open months ahead, never a paid or earlier one', async () => {
    const series = await prisma.payableSeries.findFirst({ where: { restaurantId: b.rid, description: 'Aluguel' } });
    const occ = await prisma.payable.findMany({ where: { seriesId: series.id }, orderBy: { competenceMonth: 'asc' } });
    const [oct, nov, dec] = occ;
    await prisma.payable.update({ where: { id: dec.id }, data: { status: 'PAID', paidAt: new Date('2026-10-18T00:00:00Z'), paidFrom: 'BANK', paidMethod: 'PIX' } });
    await editPayable(b.member, nov.id, { amount: '3.300', scope: 'NEXT' });
    const after = await prisma.payable.findMany({ where: { seriesId: series.id }, orderBy: { competenceMonth: 'asc' } });
    expect(after.map((r) => r.amountCents)).toEqual([300000, 330000, 300000]);
    expect((await prisma.payableSeries.findUnique({ where: { id: series.id } })).amountCents).toBe(330000);
    void oct;
  });

  it('cancel: open with a reason; without reason 400; paid 409', async () => {
    const { ids } = await createPayables(b.member, { description: 'Multa', category: 'TAXES', amount: '50', dueDate: '2026-10-20', mode: 'ONCE' }, NOW);
    expect((await cancelPayable(b.member, ids[0], ' ').catch((e) => e)).status).toBe(400);
    await cancelPayable(b.member, ids[0], 'lançada em duplicidade');
    expect(await prisma.payable.findUnique({ where: { id: ids[0] } })).toMatchObject({ status: 'CANCELED', cancelReason: 'lançada em duplicidade' });
    const paid = await prisma.payable.findFirst({ where: { restaurantId: b.rid, status: 'PAID' } });
    expect((await cancelPayable(b.member, paid.id, 'tentativa').catch((e) => e)).status).toBe(409);
  });

  it('list: summary by state for the Brasília day, features by plan', async () => {
    await createPayables(b.member, { description: 'Atrasada', category: 'OTHER', amount: '100', dueDate: '2026-10-15', mode: 'ONCE' }, NOW);
    await createPayables(b.member, { description: 'Hoje', category: 'OTHER', amount: '200', dueDate: '2026-10-18', mode: 'ONCE' }, NOW);
    const out = await listPayables(b.member, {}, NOW);
    expect(out.summary.overdue).toEqual({ count: 2, cents: 10000 + 300000 }); // + October rent (10/10)
    expect(out.summary.today).toEqual({ count: 1, cents: 20000 });
    expect(out.summary.week).toEqual({ count: 0, cents: 0 }); // the canceled Multa (10/20) does not count
    expect(out.summary.month).toEqual({ count: 3, cents: 300000 + 10000 + 20000 }); // October competence, not canceled
    expect(out.features).toEqual({ series: true, alerts: true, nfe: true });
    expect((await listPayables(p.member, {}, NOW)).features).toEqual({ series: false, alerts: false, nfe: false });
    const hoje = out.items.find((i) => i.description === 'Hoje');
    expect(hoje).toMatchObject({ state: 'TODAY', dueDate: '2026-10-18', competenceMonth: '2026-10', categoryLabel: 'Outras' });
  });

  it('routes: only owner and manager; another restaurant gets 404', async () => {
    as(b.cashier);
    expect((await LIST(new NextRequest('http://x'))).status).toBe(403);
    expect((await CREATE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({}) }))).status).toBe(403);
    as(p.ownerUser);
    const other = await prisma.payable.findFirst({ where: { restaurantId: b.rid } });
    expect((await EDIT(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ amount: '1' }) }), { params: { id: other.id } })).status).toBe(404);
  });
});
