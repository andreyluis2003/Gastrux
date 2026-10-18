// @ts-nocheck
/**
 * Plataforma › Clientes (spec 2026-10-18 §8): the Gastrux team extends a client's trial with a reason, or
 * marks the account internal. Both are audited and noted on the client's file; a paid plan is never turned
 * back into a trial.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { POST as TRIAL } from '../../../app/api/admin/customers/[id]/trial/route';
import { PATCH as INTERNAL } from '../../../app/api/admin/customers/[id]/internal/route';
import { planAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const TEAM = `equipe-${tag}@gastrux.test`;
const DAY = 86_400_000;

describe('platform: extend trial and internal account', () => {
  let rid: string, ownerId: string, teamId: string;
  const envBefore = process.env.PLATFORM_ADMIN_EMAILS;
  const as = (email: string, id: string) => (getServerSession as jest.Mock).mockResolvedValue({ user: { id, email, role: 'OWNER' }, expires: '2099-01-01' });
  const trial = (body: any) => TRIAL(new Request(`https://x/api/admin/customers/${rid}/trial`, { method: 'POST', body: JSON.stringify(body) }) as any, { params: { id: rid } });
  const internal = (body: any) => INTERNAL(new Request(`https://x/api/admin/customers/${rid}/internal`, { method: 'PATCH', body: JSON.stringify(body) }) as any, { params: { id: rid } });
  const reset = (data: any = {}) => prisma.restaurant.update({ where: { id: rid }, data: { isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'trialing', status: 'TRIAL', trialEndsAt: new Date(Date.now() - DAY), ...data } });

  beforeAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = TEAM;
    teamId = (await prisma.user.create({ data: { email: TEAM, name: 'Equipe', password: 'x', role: 'OWNER' } })).id;
    ownerId = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Espetaria ${tag}`, ownerId, status: 'TRIAL' } })).id;
  });

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = envBefore;
    await prisma.adminLog.deleteMany({ where: { entityId: rid } });
    await prisma.platformClientNote.deleteMany({ where: { restaurantId: rid } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, teamId] } } });
  });

  beforeEach(async () => {
    await prisma.adminLog.deleteMany({ where: { entityId: rid } });
    await prisma.platformClientNote.deleteMany({ where: { restaurantId: rid } });
    as(TEAM, teamId);
  });

  it('+7 days unlocks a locked trial, audited and noted', async () => {
    await reset();
    const res = await trial({ days: 7, reason: 'piloto espetaria' });
    expect(res.status).toBe(200);
    const r = await prisma.restaurant.findUnique({ where: { id: rid } });
    expect(r).toMatchObject({ subscriptionStatus: 'trialing', subscriptionTier: 'business', status: 'TRIAL' });
    expect(Math.round((r.trialEndsAt.getTime() - Date.now()) / DAY)).toBe(7);
    expect(planAccess(r).state).toBe('trial');
    const logs = await prisma.adminLog.findMany({ where: { entityId: rid } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: teamId, action: 'SYSTEM_CONFIG_CHANGE', entityType: 'Restaurant' });
    const notes = await prisma.platformClientNote.findMany({ where: { restaurantId: rid } });
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/^Teste estendido até \d{2}\/\d{2}\/\d{4}: piloto espetaria$/);
    expect(notes[0].authorEmail).toBe(TEAM);
  });

  it('a chosen date in the future is accepted', async () => {
    await reset();
    const until = new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10);
    expect((await trial({ until, reason: 'feira de outubro' })).status).toBe(200);
  });

  it('refuses without a reason, with days out of 1..180 or a past date', async () => {
    await reset();
    expect((await trial({ days: 7, reason: ' ' })).status).toBe(400);
    expect(await (await trial({ days: 7 })).json()).toEqual({ error: 'Informe o motivo' });
    expect((await trial({ days: 0, reason: 'x piloto' })).status).toBe(400);
    expect((await trial({ days: 181, reason: 'x piloto' })).status).toBe(400);
    expect((await trial({ until: '2020-01-01', reason: 'x piloto' })).status).toBe(400);
    expect(await prisma.adminLog.count({ where: { entityId: rid } })).toBe(0);
  });

  it('a client with a paid plan is never turned back into a trial', async () => {
    await reset({ subscriptionTier: 'pro', subscriptionStatus: 'active', status: 'ACTIVE', trialEndsAt: null });
    const res = await trial({ days: 7, reason: 'engano' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Este cliente já tem um plano pago' });
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).subscriptionStatus).toBe('active');
  });

  it('internal account on and off, with reason, audited and noted', async () => {
    await reset();
    expect((await internal({ isInternal: true, reason: 'conta do dono' })).status).toBe(200);
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).isInternal).toBe(true);
    expect((await internal({ isInternal: false, reason: 'virou cliente' })).status).toBe(200);
    const notes = (await prisma.platformClientNote.findMany({ where: { restaurantId: rid }, orderBy: { createdAt: 'asc' } })).map((n) => n.text);
    expect(notes).toEqual(['Conta interna ligada: conta do dono', 'Conta interna desligada: virou cliente']);
    expect(await prisma.adminLog.count({ where: { entityId: rid } })).toBe(2);
    expect((await internal({ isInternal: true })).status).toBe(400);
  });

  it('only the Gastrux team', async () => {
    as(`dono-${tag}@gastrux.test`, ownerId);
    expect((await trial({ days: 7, reason: 'eu mesmo' })).status).toBe(401);
    expect((await internal({ isInternal: true, reason: 'eu mesmo' })).status).toBe(401);
  });
});
