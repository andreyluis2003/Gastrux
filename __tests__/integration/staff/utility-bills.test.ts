// @ts-nocheck
/** Contas de consumo: accounts, bills, permissions, Pro indicators and alert (spec 2026-10-16) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as SCREEN, PUT as SAVE } from '../../../app/api/utility-bills/route';
import { POST as NEW_ACCOUNT } from '../../../app/api/utility-bills/accounts/route';
import { PATCH as EDIT_ACCOUNT } from '../../../app/api/utility-bills/accounts/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method, body?) => new NextRequest('http://x', { method, body: body ? JSON.stringify(body) : undefined });
const save = (body) => SAVE(req('PUT', body));
const account = async (body) => (await NEW_ACCOUNT(req('POST', body))).json();
const screen = async () => (await SCREEN(req('GET'))).json();
let seq = 0;

async function setup(tier) {
  const o = await prisma.user.create({ data: { email: `ub-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Ub ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const staff = {};
  for (const role of ['MANAGER', 'CASHIER', 'COOK']) {
    const u = await prisma.user.create({ data: { email: `ub-${role}-${seq++}-${tag}@gastrux.test`, name: role, password: 'x', role, currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    staff[role] = { id: u.id, email: u.email, role };
  }
  return { rid, owner: { id: o.id, email: o.email, role: 'OWNER' }, ...staff, userIds: [o.id, ...Object.values(staff).map((s: any) => s.id)] };
}

describe('contas de consumo', () => {
  // The months below are fixed: the clock is frozen on 2026-10-16 (only Date; timers stay real for Prisma)
  beforeAll(() => { jest.useFakeTimers({ now: new Date('2026-10-16T15:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'] }); });
  afterAll(() => { jest.useRealTimers(); });
  let s, p;
  beforeAll(async () => { s = await setup('pro'); p = await setup('business'); }, 60000);
  afterAll(async () => {
    for (const x of [s, p]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });

  it('only owner and manager: cashier and cook get 403 everywhere', async () => {
    for (const who of [s.CASHIER, s.COOK]) {
      as(who);
      expect((await SCREEN(req('GET'))).status).toBe(403);
      expect((await NEW_ACCOUNT(req('POST', { kind: 'ENERGY' }))).status).toBe(403);
      expect((await save({ accountId: 'x', referenceMonth: '2026-09', amount: 1 })).status).toBe(403);
    }
  });

  it('accounts: fixed kinds get their default name; OTHER needs a name; names are unique among active ones', async () => {
    as(s.MANAGER);
    const energy = await account({ kind: 'ENERGY' });
    expect((await prisma.utilityAccount.findUnique({ where: { id: energy.id } })).name).toBe('Energia');
    expect((await NEW_ACCOUNT(req('POST', { kind: 'OTHER' }))).status).toBe(400);
    expect((await NEW_ACCOUNT(req('POST', { kind: 'ENERGY' }))).status).toBe(409);
    expect((await NEW_ACCOUNT(req('POST', { kind: 'SOLAR' }))).status).toBe(400);
    const rent = await account({ kind: 'OTHER', name: 'Aluguel' });
    expect(rent.id).toBeTruthy();
  });

  it('bills: one per account and month; entering it again corrects it, audited', async () => {
    as(s.owner);
    const energy = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'ENERGY' } });
    const first = await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: '1.240,00', consumption: '1.380' })).json();
    expect(first.corrected).toBe(false);
    const again = await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: '1250', consumption: '1390' })).json();
    expect(again).toMatchObject({ id: first.id, corrected: true });
    const rows = await prisma.utilityBill.findMany({ where: { accountId: energy.id } });
    expect(rows.length).toBe(1);
    expect([rows[0].amountCents, Number(rows[0].consumption)]).toEqual([125000, 1390]);
    expect(await prisma.auditLog.count({ where: { restaurantId: s.rid, entityType: 'UtilityBill', entityId: first.id } })).toBe(1);
  });

  it('refuses bad input and accounts of another restaurant; nothing is written', async () => {
    as(s.owner);
    const energy = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'ENERGY' } });
    const rent = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'OTHER' } });
    const before = await prisma.utilityBill.count({ where: { restaurantId: s.rid } });
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 100 })).status).toBe(400);                 // consumption missing
    expect((await save({ accountId: rent.id, referenceMonth: '2026-08', amount: 100, consumption: 5 })).status).toBe(400);   // rent has no consumption
    expect((await save({ accountId: energy.id, referenceMonth: '2099-01', amount: 100, consumption: 5 })).status).toBe(400); // future
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 0, consumption: 5 })).status).toBe(400);
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 100, consumption: 5, dueDate: '2026-02-31' })).status).toBe(400); // pendências 8/9
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 100, consumption: 5, dueDate: '31/08/2026' })).status).toBe(400);
    as(p.owner);
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 100, consumption: 5 })).status).toBe(404);
    expect((await EDIT_ACCOUNT(req('PATCH', { active: false }), { params: { id: energy.id } })).status).toBe(404);
    expect(await prisma.utilityBill.count({ where: { restaurantId: s.rid } })).toBe(before);
  });

  it('a deactivated account takes no new bills but keeps its history', async () => {
    as(s.owner);
    const rent = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'OTHER' } });
    expect((await save({ accountId: rent.id, referenceMonth: '2026-08', amount: 3000 })).status).toBe(200);
    expect((await EDIT_ACCOUNT(req('PATCH', { active: false }), { params: { id: rent.id } })).status).toBe(200);
    expect((await save({ accountId: rent.id, referenceMonth: '2026-09', amount: 3000 })).status).toBe(409);
    const sc = await screen();
    expect(sc.accounts.find((a) => a.id === rent.id)).toMatchObject({ active: false });
    expect(sc.accounts.find((a) => a.id === rent.id).bills.length).toBe(1);
  });

  it('Pro gets the list without indicators and never an alert (indicators are Business, 2026-10-18)', async () => {
    as(s.owner);
    const energy = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'ENERGY' } });
    for (const [m, kwh] of [['2026-06', 1000], ['2026-07', 1000], ['2026-08', 1000]]) await save({ accountId: energy.id, referenceMonth: m, amount: 1000, consumption: kwh });
    await save({ accountId: energy.id, referenceMonth: '2026-09', amount: 2000, consumption: 2000 });
    const sc = await screen();
    expect(sc.insights).toBe(false);
    expect(sc.accounts.find((a) => a.id === energy.id).latest).toMatchObject({ referenceMonth: '2026-09', indicators: null });
    expect(await prisma.notification.count({ where: { restaurantId: s.rid } })).toBe(0);
  });

  it('Business: indicators on the screen; a late bill compares with the months before its own; one alert per account and month', async () => {
    as(p.owner);
    const energy = await account({ kind: 'ENERGY' });
    for (const [m, kwh] of [['2026-05', 5000], ['2026-06', 1000], ['2026-07', 1100], ['2026-08', 1135]]) {
      expect((await save({ accountId: energy.id, referenceMonth: m, amount: 1000, consumption: kwh })).status).toBe(200);
    }
    // September typed late: compares with June-August (avg 1078), not with May
    const late = await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: 1240, consumption: 1380 })).json();
    expect(late.alerted).toBe(true);
    const alerts = await prisma.notification.findMany({ where: { restaurantId: p.rid } });
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toMatchObject({ userId: null, actionUrl: '/dashboard/financeiro/contas' });
    expect(alerts[0].message).toContain('Energia de setembro de 2026: consumo 28% acima da média (1.380 kWh)');
    // Correcting the bill does not ring again
    expect((await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: 1240, consumption: 1400 })).json()).alerted).toBe(false);
    expect(await prisma.notification.count({ where: { restaurantId: p.rid } })).toBe(1);
    const sc = await screen();
    expect(sc.insights).toBe(true);
    const latest = sc.accounts.find((a) => a.id === energy.id).latest;
    expect(latest.referenceMonth).toBe('2026-09');
    expect(Math.round(latest.indicators.avg3.pct)).toBe(30);
  });

  it('review M5: backfilling old months never rings the bell', async () => {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-16'); // the frozen clock is in place
    as(p.owner);
    const water = await account({ kind: 'WATER' });
    const before = await prisma.notification.count({ where: { restaurantId: p.rid } });
    for (const [m, m3] of [['2025-01', 10], ['2025-02', 10], ['2025-03', 10]]) await save({ accountId: water.id, referenceMonth: m, amount: 100, consumption: m3 });
    expect((await (await save({ accountId: water.id, referenceMonth: '2025-04', amount: 300, consumption: 30 })).json()).alerted).toBe(false);
    expect(await prisma.notification.count({ where: { restaurantId: p.rid } })).toBe(before);
  });
});

// Pendências #3 (2026-10-23): two saves of the same bill at once both read "no previous", the second overwrote
// without audit, and the alert's "check then create" could ring twice
describe('contas de consumo: two saves of the same bill at once', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date('2026-10-16T15:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'] }); });
  afterAll(() => { jest.useRealTimers(); });
  let b;
  beforeAll(async () => { b = await setup('business'); }, 60000);
  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { restaurantId: b.rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: b.rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: b.userIds } } }); } catch {}
  });

  it('one creates, the other corrects it with an audit, and the bell rings once', async () => {
    as(b.owner);
    const energy = await account({ kind: 'ENERGY' });
    for (const [m, kwh] of [['2026-06', 1000], ['2026-07', 1000], ['2026-08', 1000]]) await save({ accountId: energy.id, referenceMonth: m, amount: 1000, consumption: kwh });
    const results = [];
    for (let round = 0; round < 5; round++) {
      const ym = `2026-0${round + 1}`; // months without history: no alert, only the audit race
      const [x, y] = await Promise.all([
        save({ accountId: energy.id, referenceMonth: ym, amount: 100, consumption: 10 }),
        save({ accountId: energy.id, referenceMonth: ym, amount: 200, consumption: 20 }),
      ]);
      results.push([(await x.json()).corrected, (await y.json()).corrected].sort());
    }
    expect(results).toEqual(Array(5).fill([false, true]));
    const ids = (await prisma.utilityBill.findMany({ where: { accountId: energy.id, referenceMonth: { lt: new Date('2026-06-01') } }, select: { id: true } })).map((r) => r.id);
    expect(await prisma.auditLog.count({ where: { restaurantId: b.rid, entityType: 'UtilityBill', entityId: { in: ids } } })).toBe(5);
    // September far above June-August, saved twice at once: one alert
    await Promise.all([
      save({ accountId: energy.id, referenceMonth: '2026-09', amount: 2000, consumption: 2000 }),
      save({ accountId: energy.id, referenceMonth: '2026-09', amount: 2000, consumption: 2100 }),
    ]);
    expect(await prisma.notification.count({ where: { restaurantId: b.rid, data: { path: ['dedupeKey'], equals: `utility:${energy.id}:2026-09` } } })).toBe(1);
  }, 60000);
});

// Pendências #6 (2026-10-23): the bill of the month still running was divided by half a month of sales
describe('contas de consumo: % of revenue only for a finished month', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date('2026-10-16T15:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'] }); });
  afterAll(() => { jest.useRealTimers(); });
  let b;
  beforeAll(async () => { b = await setup('business'); }, 60000);
  afterAll(async () => {
    try { await prisma.order.deleteMany({ where: { restaurantId: b.rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: b.rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: b.userIds } } }); } catch {}
  });

  it('September shows its share of sales; October (still running) does not', async () => {
    as(b.owner);
    for (const at of ['2026-09-15T20:00:00Z', '2026-10-10T20:00:00Z']) {
      await prisma.order.create({ data: { restaurantId: b.rid, orderNumber: `UB${tag}${seq++}`, status: 'COMPLETED', total: 10000, createdAt: new Date(at) } });
    }
    const water = await account({ kind: 'WATER' });
    const gas = await account({ kind: 'PIPED_GAS' });
    await save({ accountId: water.id, referenceMonth: '2026-09', amount: 500, consumption: 10 });
    await save({ accountId: gas.id, referenceMonth: '2026-10', amount: 500, consumption: 10 });
    const sc = await screen();
    expect(sc.accounts.find((a) => a.id === water.id).latest.indicators.revenuePct).toBeCloseTo(5, 5);
    expect(sc.accounts.find((a) => a.id === gas.id).latest.indicators.revenuePct).toBeNull();
  });
});

// Pendências #12 (2026-10-23): only "Outra conta" has a name of its own (spec); the fixed kinds keep theirs
describe('contas de consumo: renaming', () => {
  let b;
  beforeAll(async () => { b = await setup('pro'); }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: b.rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: b.userIds } } }); } catch {}
  });

  it('a fixed kind cannot be renamed; "Outra" can', async () => {
    as(b.owner);
    const energy = await account({ kind: 'ENERGY' });
    const other = await account({ kind: 'OTHER', name: 'Aluguel do freezer' });
    const res = await EDIT_ACCOUNT(req('PATCH', { name: 'Minha luz' }), { params: { id: energy.id } });
    expect(res.status).toBe(400);
    expect((await prisma.utilityAccount.findUnique({ where: { id: energy.id } })).name).toBe('Energia');
    expect((await EDIT_ACCOUNT(req('PATCH', { name: 'Freezer alugado' }), { params: { id: other.id } })).status).toBe(200);
    expect((await prisma.utilityAccount.findUnique({ where: { id: other.id } })).name).toBe('Freezer alugado');
  });
});
