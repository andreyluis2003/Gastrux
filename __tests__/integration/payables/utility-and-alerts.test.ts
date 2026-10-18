// @ts-nocheck
/**
 * Utility bills feed contas a pagar, and the 07h morning check (spec 2026-10-18 contas a pagar §5, §6): a bill with a
 * due date creates / updates its payable while it is open; clearing the date cancels an open one and keeps a paid
 * one; Business gets one bell summary a day and an e-mail; Pro gets neither and its series never generate.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const mails = [];
jest.mock('../../../lib/email/transactional', () => ({
  sendTransactionalEmail: jest.fn(async (m) => { mails.push(m); return { provider: 'resend' }; }),
}));
import { upsertBill } from '../../../lib/utility-bills/service';
import { morningCheck } from '../../../lib/payables/alerts';
import { ensureSeries } from '../../../lib/payables/service';
import { POST as MORNING } from '../../../app/api/payables/morning-check/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const NOW = new Date('2026-10-18T10:00:00Z'); // 07h in Brasília
const d = (s) => new Date(`${s}T00:00:00.000Z`);
let seq = 0;

async function setup(tier) {
  const o = await prisma.user.create({ data: { email: `pua-${seq++}-${tag}@gastrux.test`, name: 'Dona Ana', password: 'x', role: 'OWNER' } });
  const rid = (await prisma.restaurant.create({ data: { name: `PUA ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active' } })).id;
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
  return { rid, ownerId: o.id, email: o.email, member: { userId: o.id, restaurantId: rid, role: 'OWNER' } };
}

describe('utility bills link and the morning check', () => {
  let b, p, energy;
  const secret = process.env.CRON_SECRET;
  beforeAll(async () => {
    process.env.CRON_SECRET = `cron-${tag}`;
    b = await setup('business');
    p = await setup('pro');
    energy = await prisma.utilityAccount.create({ data: { restaurantId: b.rid, kind: 'ENERGY', name: 'Energia' } });
  }, 60000);
  afterAll(async () => {
    process.env.CRON_SECRET = secret;
    for (const x of [b, p]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.payable.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.payableSeries.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: x.rid } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { userId: x.ownerId } }); } catch {}
      try { await prisma.user.delete({ where: { id: x.ownerId } }); } catch {}
    }
  });

  const linked = async () => prisma.payable.findFirst({ where: { restaurantId: b.rid, source: 'UTILITY' } });

  it('a bill with a due date creates its payable, and saving again updates it', async () => {
    await upsertBill(b.member, { accountId: energy.id, referenceMonth: '2026-09', amount: '480', consumption: '400', dueDate: '2026-10-20' }, NOW);
    let pay = await linked();
    expect(pay).toMatchObject({ category: 'UTILITIES', amountCents: 48000, status: 'OPEN', description: 'Energia setembro de 2026' });
    expect(pay.competenceMonth.toISOString().slice(0, 10)).toBe('2026-09-01');
    await upsertBill(b.member, { accountId: energy.id, referenceMonth: '2026-09', amount: '500', consumption: '400', dueDate: '2026-10-22' }, NOW);
    pay = await linked();
    expect(pay.amountCents).toBe(50000);
    expect(pay.dueDate.toISOString().slice(0, 10)).toBe('2026-10-22');
    expect(await prisma.payable.count({ where: { restaurantId: b.rid, source: 'UTILITY' } })).toBe(1);
  });

  it('a paid payable keeps its values; clearing the date keeps a paid one', async () => {
    const pay = await linked();
    await prisma.payable.update({ where: { id: pay.id }, data: { status: 'PAID', paidAt: d('2026-10-18'), paidFrom: 'BANK', paidMethod: 'BOLETO' } });
    await upsertBill(b.member, { accountId: energy.id, referenceMonth: '2026-09', amount: '520', consumption: '400', dueDate: '2026-10-22' }, NOW);
    expect((await prisma.payable.findUnique({ where: { id: pay.id } })).amountCents).toBe(50000);
    await upsertBill(b.member, { accountId: energy.id, referenceMonth: '2026-09', amount: '520', consumption: '400' }, NOW);
    expect((await prisma.payable.findUnique({ where: { id: pay.id } })).status).toBe('PAID');
  });

  it('clearing the due date cancels an open linked payable', async () => {
    await upsertBill(b.member, { accountId: energy.id, referenceMonth: '2026-08', amount: '300', consumption: '400', dueDate: '2026-09-20' }, NOW);
    const aug = await prisma.payable.findFirst({ where: { restaurantId: b.rid, source: 'UTILITY', competenceMonth: d('2026-08-01') } });
    expect(aug.status).toBe('OPEN');
    await upsertBill(b.member, { accountId: energy.id, referenceMonth: '2026-08', amount: '300', consumption: '400' }, NOW);
    expect(await prisma.payable.findUnique({ where: { id: aug.id } })).toMatchObject({ status: 'CANCELED', cancelReason: 'Vencimento removido na conta de consumo' });
  });

  it('morning check (Business): one summary a day and one e-mail to the owner', async () => {
    const mk = (restaurantId, description, due, cents) => prisma.payable.create({ data: { restaurantId, description, category: 'OTHER', amountCents: cents, competenceMonth: d(`${due.slice(0, 7)}-01`), dueDate: d(due), createdById: b.ownerId } });
    await mk(b.rid, 'Atrasada', '2026-10-15', 30000);
    await mk(b.rid, 'Hoje A', '2026-10-18', 100000);
    await mk(b.rid, 'Hoje B', '2026-10-18', 45000);
    await mk(b.rid, 'Em 3 dias', '2026-10-21', 20000);
    await mk(p.rid, 'Pro hoje', '2026-10-18', 10000);
    const first = await morningCheck(NOW);
    expect(first.alerted).toBe(1);
    const notes = await prisma.notification.findMany({ where: { restaurantId: b.rid, data: { path: ['kind'], equals: 'payables-morning' } } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Contas a pagar: 2 vencem hoje (R$ 1.450,00) · 1 atrasada (R$ 300,00) · 1 em 3 dias');
    expect(notes[0].actionUrl).toBe('/contas-a-pagar');
    expect(mails.filter((m) => m.to === b.email)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { restaurantId: p.rid } })).toBe(0);
    await morningCheck(NOW);
    expect(await prisma.notification.count({ where: { restaurantId: b.rid, data: { path: ['kind'], equals: 'payables-morning' } } })).toBe(1);
  });

  it('a Pro series never generates bills', async () => {
    const s = await prisma.payableSeries.create({ data: { restaurantId: p.rid, description: 'Aluguel', category: 'RENT', amountCents: 100000, dueDay: 10, startMonth: d('2026-10-01'), createdById: p.ownerId } });
    expect(await ensureSeries(p.rid, NOW)).toBe(0);
    expect(await prisma.payable.count({ where: { seriesId: s.id } })).toBe(0);
  });

  it('the route needs the cron secret', async () => {
    expect((await MORNING(new Request('https://x/api/payables/morning-check', { method: 'POST' }) as any)).status).toBe(401);
    expect((await MORNING(new Request('https://x/api/payables/morning-check', { method: 'POST', headers: { 'x-internal-trigger': `cron-${tag}` } }) as any)).status).toBe(200);
  });
});
