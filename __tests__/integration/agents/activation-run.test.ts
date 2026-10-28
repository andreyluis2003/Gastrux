// @ts-nocheck
/**
 * The activation agent's routine (spec 2026-10-27), run every 5 minutes by the VPS cron: drafts go to the
 * approval queue (one row per account x trigger x channel, so reruns never repeat), owner alerts go to
 * the platform team's bell and e-mail, and nothing is ever drafted for internal or opted-out accounts.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/ai/client', () => ({ getAnthropic: jest.fn(() => null) }));
jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue({ provider: 'resend' }) }));
import { getServerSession } from 'next-auth';
import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { runActivationAgent } from '../../../lib/agents/activation/run';
import { POST } from '../../../app/api/agents/activation/run/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const MIN = 60_000;
const DAY = 86_400_000;
const now = new Date('2026-10-28T13:00:00Z'); // 09:00 in Sinop

let admin: any;
let adminRestaurant: any;

async function account(opts: { internal?: boolean; optOut?: boolean; createdAt?: Date; trialEndsAt?: Date } = {}) {
  const tag = crypto.randomBytes(4).toString('hex');
  const owner = await prisma.user.create({
    data: { email: `act-run-${tag}@gastrux.test`, name: 'Maria Silva', role: 'OWNER', whatsapp: '5566999998888', onboardingEmailsOptOut: !!opts.optOut },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Pizzaria ${tag}`, ownerId: owner.id, status: 'TRIAL', subscriptionStatus: 'trialing', timezone: 'America/Cuiaba',
      isInternal: !!opts.internal, createdAt: opts.createdAt ?? new Date(now.getTime() - 6 * MIN),
      trialEndsAt: opts.trialEndsAt ?? new Date(now.getTime() + 30 * DAY),
    },
  });
  return { owner, restaurant };
}

describe('activation agent routine', () => {
  const made: any[] = [];

  beforeAll(async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    admin = await prisma.user.create({ data: { email: `act-admin-${tag}@gastrux.test`, name: 'Admin', role: 'ADMIN' } });
    adminRestaurant = await prisma.restaurant.create({ data: { name: `Gastrux ${tag}`, ownerId: admin.id, isInternal: true } });
    await prisma.user.update({ where: { id: admin.id }, data: { currentRestaurantId: adminRestaurant.id } });
  });

  afterAll(async () => {
    for (const a of made) {
      await prisma.restaurant.delete({ where: { id: a.restaurant.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: a.owner.id } }).catch(() => {});
    }
    await prisma.notification.deleteMany({ where: { userId: admin.id } });
    await prisma.restaurant.delete({ where: { id: adminRestaurant.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  });

  beforeEach(() => (sendTransactionalEmail as jest.Mock).mockClear());

  it('a new account gets an e-mail and a WhatsApp draft, and the team is told', async () => {
    const a = await account(); made.push(a);
    const res = await runActivationAgent(now, { only: [a.restaurant.id] });
    expect(res.drafted).toBe(2);
    const rows = await prisma.agentAction.findMany({ where: { restaurantId: a.restaurant.id }, orderBy: { channel: 'asc' } });
    expect(rows.map((r) => [r.trigger, r.channel, r.status])).toEqual([['boas_vindas', 'EMAIL', 'DRAFT'], ['boas_vindas', 'WHATSAPP', 'DRAFT']]);
    expect(rows[0].data).toMatchObject({ stepsDone: expect.any(Number) });
    expect(rows[0].userId).toBe(a.owner.id);
    const bell = await prisma.notification.findMany({ where: { userId: admin.id, title: 'Novo cliente: mandar boas-vindas' } });
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ type: 'SYSTEM_INFO', actionUrl: '/admin/agente', restaurantId: adminRestaurant.id });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('a rerun, even two at once, never repeats a draft', async () => {
    const a = await account(); made.push(a);
    await runActivationAgent(now, { only: [a.restaurant.id] });
    expect((await runActivationAgent(now, { only: [a.restaurant.id] })).drafted).toBe(0);
    const b = await account(); made.push(b);
    await Promise.all([runActivationAgent(now, { only: [b.restaurant.id] }), runActivationAgent(now, { only: [b.restaurant.id] })]);
    expect(await prisma.agentAction.count({ where: { restaurantId: a.restaurant.id } })).toBe(2);
    expect(await prisma.agentAction.count({ where: { restaurantId: b.restaurant.id } })).toBe(2);
    const bell = await prisma.notification.count({ where: { userId: admin.id, data: { path: ['restaurantId'], equals: b.restaurant.id } } });
    expect(bell).toBe(1);
  });

  it('trial ending without a sale: an owner alert, sent to the team by bell and e-mail, nothing to the client', async () => {
    const a = await account({ createdAt: new Date(now.getTime() - 27 * DAY), trialEndsAt: new Date(now.getTime() + 3 * DAY) }); made.push(a);
    await prisma.agentAction.create({ data: { restaurantId: a.restaurant.id, userId: a.owner.id, trigger: 'boas_vindas', channel: 'EMAIL', status: 'SENT', text: 'Oi', createdAt: new Date(now.getTime() - 26 * DAY) } });
    const res = await runActivationAgent(now, { only: [a.restaurant.id] });
    expect(res).toMatchObject({ drafted: 0, alerts: 1 });
    const rows = await prisma.agentAction.findMany({ where: { restaurantId: a.restaurant.id, trigger: 'fim_teste_sem_venda' } });
    expect(rows.map((r) => [r.channel, r.status])).toEqual([['OWNER_ALERT', 'SENT']]);
    expect(rows[0].sentAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: admin.id, data: { path: ['restaurantId'], equals: a.restaurant.id } } })).toBe(1);
    const to = (sendTransactionalEmail as jest.Mock).mock.calls.map((c) => c[0].to);
    expect(to).toContain(admin.email);
    expect(to).not.toContain(a.owner.email);
  });

  it('never drafts for an internal account or an owner who asked to stop', async () => {
    const internal = await account({ internal: true }); made.push(internal);
    const optOut = await account({ optOut: true }); made.push(optOut);
    const res = await runActivationAgent(now, { only: [internal.restaurant.id, optOut.restaurant.id] });
    expect(res.drafted).toBe(0);
    expect(await prisma.agentAction.count({ where: { restaurantId: { in: [internal.restaurant.id, optOut.restaurant.id] } } })).toBe(0);
  });

  it('the route refuses a call with no cron secret and no platform admin', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const res = await POST(new Request('http://x/api/agents/activation/run', { method: 'POST' }) as any);
    expect(res.status).toBe(401);
  });
});
