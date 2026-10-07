// @ts-nocheck
/**
 * Staff commissions (2026-10-06): live week/month view, closing a pay period, approve/pay/cancel/
 * adjust, and who sees what. Rules in lib/staff/commission-rules.ts.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { salesByStaff, closePeriod, updateCommission } from '../../../lib/staff/commissions';
import { periodContaining } from '../../../lib/staff/commission-rules';
import { GET } from '../../../app/api/admin/staff/commissions/route';
import { PATCH as PATCH_ONE } from '../../../app/api/admin/staff/commissions/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('staff commissions', () => {
  let rid: string, otherRid: string, ownerId: string, waiterUserId: string, waiter2UserId: string, recipeId: string;
  const owner = () => ({ userId: ownerId, restaurantId: rid, role: 'OWNER' as const });
  const users: string[] = [];

  async function user(name: string, role: string) {
    const u = await prisma.user.create({ data: { email: `com-${name}-${tag}@gastrux.test`, name, password: 'x', role, active: true } });
    users.push(u.id);
    return u;
  }
  // Modifiers follow the comanda's own line rule (lib/comanda/line-total.ts, tested there)
  async function bill(restaurantId: string, userId: string, closedAt: Date | null, status: string, items: Array<[number, number]>) {
    const s = await prisma.orderSession.create({ data: { restaurantId, userId, status, closedAt } });
    for (const [price, quantity] of items) {
      await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price, quantity } });
    }
    return s;
  }

  beforeAll(async () => {
    const o = await user('dono', 'OWNER'); ownerId = o.id;
    const r = await prisma.restaurant.create({ data: { name: `Com ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business' } });
    rid = r.id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const other = await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } });
    otherRid = other.id;

    const w = await user('Garcom Ana', 'CASHIER'); waiterUserId = w.id;
    const w2 = await user('Garcom Bia', 'CASHIER'); waiter2UserId = w2.id;
    for (const [u, type, value] of [[w, 'PERCENTAGE', 5], [w2, 'FIXED', 2]] as const) {
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
      await prisma.user.update({ where: { id: u.id }, data: { currentRestaurantId: rid } });
      await prisma.staffMember.create({ data: { restaurantId: rid, userId: u.id, role: 'CASHIER', commissionType: type, commissionValue: value } });
    }
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `R-${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;

    // September 2026 (closed in Brasília time): Ana 2 bills, Bia 1 bill
    await bill(rid, waiterUserId, new Date('2026-09-10T18:00:00Z'), 'CLOSED', [[50, 2]]);           // 100,00
    await bill(rid, waiterUserId, new Date('2026-09-20T23:00:00Z'), 'CLOSED', [[30, 1], [10, 3]]);  // 60,00
    await bill(rid, waiter2UserId, new Date('2026-09-15T20:00:00Z'), 'CLOSED', [[40, 1]]);          // 40,00
    // Not counted: cancelled, still open, another restaurant, and a bill closed 1 Oct 00:30 BRT
    await bill(rid, waiterUserId, new Date('2026-09-11T18:00:00Z'), 'CANCELLED', [[500, 1]]);
    await bill(rid, waiterUserId, null, 'OPEN', [[500, 1]]);
    await bill(otherRid, waiterUserId, new Date('2026-09-12T18:00:00Z'), 'CLOSED', [[700, 1]]);
    await bill(rid, waiterUserId, new Date('2026-10-01T03:30:00Z'), 'CLOSED', [[20, 1]]);
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    for (const id of users) { try { await prisma.user.delete({ where: { id } }); } catch {} }
  });

  it('counts the items of closed bills each person opened, in the Brasília month', async () => {
    const rows = await salesByStaff(rid, periodContaining('MONTHLY', '2026-09-01'));
    const ana = rows.find((r) => r.userId === waiterUserId);
    const bia = rows.find((r) => r.userId === waiter2UserId);
    expect(ana).toMatchObject({ bills: 2, salesCents: 16000, commissionCents: 800, ruleLabel: '5% das vendas' });
    expect(bia).toMatchObject({ bills: 1, salesCents: 4000, commissionCents: 200, ruleLabel: 'R$ 2,00 por conta' });
  });

  it('the week view shows the same sales split by week', async () => {
    const week = await salesByStaff(rid, periodContaining('WEEKLY', '2026-09-10'));
    expect(week.find((r) => r.userId === waiterUserId)).toMatchObject({ bills: 1, salesCents: 10000 });
  });

  it('closing a running period is refused', async () => {
    const r = await closePeriod(owner(), 'MONTHLY', '2026-10-06', new Date('2026-10-06T12:00:00Z'));
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('closing a finished month freezes one pending record per person, and closing again refreshes only pending ones', async () => {
    const first = await closePeriod(owner(), 'MONTHLY', '2026-09-30', new Date('2026-10-06T12:00:00Z'));
    expect(first).toEqual({ ok: true, created: 2, updated: 0, kept: 0 });
    const recs = await prisma.staffCommission.findMany({ where: { staffMember: { restaurantId: rid } } });
    expect(recs.map((c) => Number(c.commissionEarned)).sort()).toEqual([2, 8]);
    expect(recs.every((c) => c.status === 'PENDING' && c.periodType === 'MONTHLY')).toBe(true);

    const ana = recs.find((c) => Number(c.commissionEarned) === 8)!;
    expect(await updateCommission(owner(), ana.id, { action: 'approve' })).toMatchObject({ ok: true });
    const again = await closePeriod(owner(), 'MONTHLY', '2026-09-30', new Date('2026-10-06T12:00:00Z'));
    expect(again).toEqual({ ok: true, created: 0, updated: 1, kept: 1 });
  });

  it('approve -> pay; adjust and cancel need a reason; nothing moves backwards', async () => {
    const recs = await prisma.staffCommission.findMany({ where: { staffMember: { restaurantId: rid } } });
    const approved = recs.find((c) => c.status === 'APPROVED')!;
    const pending = recs.find((c) => c.status === 'PENDING')!;

    expect(await updateCommission(owner(), pending.id, { action: 'adjust', bonusCents: 500, reason: '' })).toMatchObject({ ok: false, status: 400 });
    expect(await updateCommission(owner(), pending.id, { action: 'adjust', bonusCents: 500, reason: 'Meta batida' })).toMatchObject({ ok: true });
    const adjusted = await prisma.staffCommission.findUnique({ where: { id: pending.id } });
    expect(Number(adjusted!.totalEarned)).toBe(7);
    expect(await updateCommission(owner(), pending.id, { action: 'adjust', bonusCents: -1000, reason: 'x' })).toMatchObject({ ok: false, status: 400 });

    expect(await updateCommission(owner(), approved.id, { action: 'pay' })).toMatchObject({ ok: true });
    expect(await updateCommission(owner(), approved.id, { action: 'approve' })).toMatchObject({ ok: false, status: 409 });
    expect(await updateCommission(owner(), approved.id, { action: 'cancel', reason: 'erro' })).toMatchObject({ ok: false, status: 409 });
  });

  it('another restaurant cannot touch these records', async () => {
    const rec = await prisma.staffCommission.findFirst({ where: { staffMember: { restaurantId: rid } } });
    const r = await updateCommission({ userId: ownerId, restaurantId: otherRid, role: 'OWNER' }, rec!.id, { action: 'approve' });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('a staff member sees only their own lines and cannot change anything', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: waiter2UserId, email: `com-Garcom Bia-${tag}@gastrux.test` } });
    const res = await GET(new NextRequest('http://x/api/admin/staff/commissions?view=MONTHLY&date=2026-09-15'));
    const body = await res.json();
    expect(body.canManage).toBe(false);
    expect(body.rows.map((r) => r.userId)).toEqual([waiter2UserId]);
    expect(body.records.every((c) => c.name === 'Garcom Bia')).toBe(true);

    const rec = await prisma.staffCommission.findFirst({ where: { staffMember: { userId: waiter2UserId } } });
    const denied = await PATCH_ONE(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ action: 'pay' }) }), { params: { id: rec!.id } });
    expect(denied.status).toBe(403);
  });

  it('the owner sees the whole team', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId, email: `com-dono-${tag}@gastrux.test` } });
    const res = await GET(new NextRequest('http://x/api/admin/staff/commissions?view=MONTHLY&date=2026-09-15'));
    const body = await res.json();
    expect(body.canManage).toBe(true);
    expect(body.totals).toEqual({ bills: 3, salesCents: 20000, commissionCents: 1000 });
  });
});
