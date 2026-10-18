// @ts-nocheck
/**
 * Plans of 2026-10-18 §5: on days 23, 27 and 30 of the trial (7, 3 and 1 days left) the owner gets a bell
 * alert and an e-mail, once each. Internal accounts, locked ones and trials far from the end get nothing.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const mails: Array<{ to: string; subject: string }> = [];
jest.mock('../../../lib/email/transactional', () => ({
  sendTransactionalEmail: jest.fn(async (m) => { mails.push(m); return { provider: 'resend' }; }),
}));
import { POST } from '../../../app/api/billing/trial-reminders/route';
import { sendTrialReminders } from '../../../lib/billing/trial-reminders';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 86_400_000;

describe('trial reminders', () => {
  const ids: Record<string, string> = {};
  const owners: string[] = [];
  const secret = process.env.CRON_SECRET;
  const make = async (key: string, endsInDays: number | null, extra: any = {}) => {
    const u = await prisma.user.create({ data: { email: `tr-${key}-${tag}@gastrux.test`, name: `Dono ${key}`, password: 'x', role: 'OWNER' } });
    owners.push(u.id);
    ids[key] = (await prisma.restaurant.create({
      data: { name: `TR ${key} ${tag}`, ownerId: u.id, status: 'TRIAL', subscriptionTier: 'business', subscriptionStatus: 'trialing',
        trialEndsAt: endsInDays === null ? null : new Date(Date.now() + endsInDays * DAY), ...extra },
    })).id;
  };
  const alerts = () => prisma.notification.findMany({ where: { restaurantId: { in: Object.values(ids) }, data: { path: ['kind'], equals: 'trial-reminder' } } });

  beforeAll(async () => {
    process.env.CRON_SECRET = `cron-${tag}`;
    await make('d7', 6.5);
    await make('d3', 2.5);
    await make('d1', 0.5);
    await make('far', 20);
    await make('internal', 2.5, { isInternal: true });
    await make('locked', -1);
    // Subscribed during the trial (final review I-3): no 'escolha um plano' e-mail
    await make('subscribed', 2.5);
    const subOwner = (await prisma.restaurant.findUnique({ where: { id: ids.subscribed } })).ownerId;
    await prisma.subscription.create({ data: { userId: subOwner, restaurantId: ids.subscribed, gateway: 'MERCADO_PAGO', gatewaySubscriptionId: `pre-tr-${tag}`, tier: 'business', billingCycle: 'monthly', amount: 199, status: 'trialing' } });
  });

  afterAll(async () => {
    process.env.CRON_SECRET = secret;
    await prisma.notification.deleteMany({ where: { restaurantId: { in: Object.values(ids) } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: owners } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
  });

  it('only with the cron secret', async () => {
    const res = await POST(new Request('https://x/api/billing/trial-reminders', { method: 'POST' }) as any);
    expect(res.status).toBe(401);
  });

  it('one bell alert and one e-mail per milestone, never twice', async () => {
    const res = await POST(new Request('https://x/api/billing/trial-reminders', { method: 'POST', headers: { 'x-internal-trigger': `cron-${tag}` } }) as any);
    expect(res.status).toBe(200);
    const list = await alerts();
    const byRest = Object.fromEntries(list.map((n) => [n.restaurantId, n]));
    expect(byRest[ids.d7].title).toBe('Faltam 7 dias do seu teste');
    expect(byRest[ids.d3].title).toBe('Faltam 3 dias do seu teste');
    expect(byRest[ids.d1].title).toBe('Último dia do seu teste');
    expect(byRest[ids.d1].actionUrl).toBe('/pricing');
    expect(byRest[ids.far]).toBeUndefined();
    expect(byRest[ids.internal]).toBeUndefined();
    expect(byRest[ids.locked]).toBeUndefined();
    expect(byRest[ids.subscribed]).toBeUndefined();
    const ours = mails.filter((m) => m.to.endsWith(`${tag}@gastrux.test`));
    expect(ours.map((m) => m.to).sort()).toEqual([`tr-d1-${tag}@gastrux.test`, `tr-d3-${tag}@gastrux.test`, `tr-d7-${tag}@gastrux.test`]);

    await sendTrialReminders();
    expect(await alerts()).toHaveLength(3);
    expect(mails.filter((m) => m.to.endsWith(`${tag}@gastrux.test`))).toHaveLength(3);
  });

  it('an extended trial gets its reminders again (final review M-3)', async () => {
    await prisma.restaurant.update({ where: { id: ids.d3 }, data: { trialEndsAt: new Date(Date.now() + 2.2 * DAY) } });
    await sendTrialReminders();
    expect((await alerts()).filter((n) => n.restaurantId === ids.d3)).toHaveLength(2);
  });
});
