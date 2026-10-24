// @ts-nocheck
/** Plataforma Gastrux > Indicações (plan 2026-10-24 indicacao, Task 8) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET } from '../../../app/api/admin/platform/referrals/route';
import { PATCH } from '../../../app/api/admin/platform/referrals/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const users: string[] = [];
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const patch = (id, body) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: { id } });

let staff, ownerUser, referrerId, rows;
beforeAll(async () => {
  staff = await prisma.user.create({ data: { email: `rfp-staff-${tag}@gastrux.test`, name: 'Equipe', password: 'x', role: 'OWNER' } });
  ownerUser = await prisma.user.create({ data: { email: `rfp-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  users.push(staff.id, ownerUser.id);
  process.env.PLATFORM_ADMIN_EMAILS = staff.email;
  referrerId = (await prisma.restaurant.create({ data: { name: `Indicador ${tag}`, ownerId: ownerUser.id } })).id;
  rows = {};
  for (const status of ['CONFIRMING', 'APPLIED', 'EARNED']) {
    const r = await prisma.restaurant.create({ data: { name: `Indicado ${status} ${tag}`, ownerId: ownerUser.id } });
    rows[status] = await prisma.referral.create({ data: { referrerRestaurantId: referrerId, referredRestaurantId: r.id, status, amountCents: 14900, earnedAt: status === 'CONFIRMING' ? null : new Date() } });
  }
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
  await prisma.restaurant.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

it('a restaurant owner gets 401', async () => {
  as({ id: ownerUser.id, email: ownerUser.email, role: 'OWNER' });
  expect((await GET(new NextRequest('http://x'))).status).toBe(401);
  expect((await patch(rows.CONFIRMING.id, { action: 'cancel', reason: 'Suspeita' })).status).toBe(401);
});

it('staff lists the referrals with both names and the month totals', async () => {
  as({ id: staff.id, email: staff.email, role: 'OWNER' });
  const body = await (await GET(new NextRequest('http://x'))).json();
  const mine = body.referrals.filter((r) => r.referrerName === `Indicador ${tag}`);
  expect(mine).toHaveLength(3);
  expect(mine[0]).toHaveProperty('referredName');
  expect(body.month.earned).toBeGreaterThanOrEqual(2);
  expect(body.month.estimatedCostCents).toBeGreaterThanOrEqual(29800);
});

it('cancel needs a reason, writes the audit log, and never touches an applied month', async () => {
  as({ id: staff.id, email: staff.email, role: 'OWNER' });
  expect((await patch(rows.CONFIRMING.id, { action: 'cancel', reason: 'ab' })).status).toBe(400);
  expect((await patch(rows.APPLIED.id, { action: 'cancel', reason: 'Suspeita de lojas do mesmo dono' })).status).toBe(409);
  const ok = await patch(rows.CONFIRMING.id, { action: 'cancel', reason: 'Suspeita de lojas do mesmo dono' });
  expect(ok.status).toBe(200);
  expect(await prisma.referral.findUnique({ where: { id: rows.CONFIRMING.id } })).toMatchObject({ status: 'CANCELLED', cancelReason: 'Suspeita de lojas do mesmo dono' });
  const audit = await prisma.auditLog.findFirst({ where: { userId: staff.id, entityId: rows.CONFIRMING.id } });
  expect(audit.changes).toMatch(/Suspeita de lojas do mesmo dono/);
});
