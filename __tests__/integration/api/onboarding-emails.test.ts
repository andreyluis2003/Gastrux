// @ts-nocheck
/**
 * Onboarding tips by e-mail (2026-10-19, owner option A): who gets them, once, in their window, and the stop link.
 * Sending is mocked: what matters here is who and when.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn(async () => ({ provider: 'resend' })) }));
import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { runOnboardingEmails, unsubscribeToken } from '../../../lib/onboarding/emails';
import { GET as UNSUBSCRIBE } from '../../../app/api/email/unsubscribe/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 86_400_000;

describe('onboarding e-mails', () => {
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * DAY);
  const users = {};
  const restaurants = [];
  const sentTo = () => (sendTransactionalEmail as jest.Mock).mock.calls.map(([a]) => `${a.to}|${a.notificationId}`);

  const owner = async (key, createdAt, { internal = false, optOut = false } = {}) => {
    const u = await prisma.user.create({ data: { email: `onb-${key}-${tag}@gastrux.test`, name: `Dono ${key}`, password: 'x', role: 'OWNER', createdAt, onboardingEmailsOptOut: optOut } });
    restaurants.push((await prisma.restaurant.create({ data: { name: `ONB ${key} ${tag}`, ownerId: u.id, status: 'ACTIVE', isInternal: internal } })).id);
    users[key] = u;
    return u;
  };

  beforeAll(async () => {
    await owner('new', ago(0.1));
    await owner('day8', ago(8));
    await owner('old', ago(60));
    await owner('internal', ago(0.1), { internal: true });
    await owner('optout', ago(0.1), { optOut: true });
    // A cook of the new restaurant: staff, never a recipient
    users.cook = await prisma.user.create({ data: { email: `onb-cook-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', createdAt: ago(0.1) } });
    await prisma.restaurantUser.create({ data: { restaurantId: restaurants[0], userId: users.cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: restaurants } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: restaurants } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } }); } catch {}
  });

  beforeEach(() => (sendTransactionalEmail as jest.Mock).mockClear());

  // The tips of day 1, 7 and 14 left on 2026-10-28 (the activation agent took over): an 8-day owner gets nothing
  it('the new owner gets the welcome; the 8-day owner, staff, tests, opted out and old accounts get nothing', async () => {
    await runOnboardingEmails(now);
    const mine = sentTo().filter((s) => s.includes(tag));
    expect(mine).toEqual([`${users.new.email}|onboarding-welcome`]);
    expect((await prisma.user.findUnique({ where: { id: users.new.id } })).emailSentWelcome).toBe(true);
  });

  it('a second run sends nothing again', async () => {
    await runOnboardingEmails(now);
    expect(sentTo().filter((s) => s.includes(tag))).toEqual([]);
  });

  it('a failed send is tried again on the next run', async () => {
    const late = await owner('late', ago(1.5));
    (sendTransactionalEmail as jest.Mock).mockImplementation(async ({ to }) => {
      if (to === late.email) throw new Error('Resend 500');
      return { provider: 'resend' };
    });
    // 1.5 days old: the welcome (days 0-3) is due and fails
    const first = await runOnboardingEmails(now);
    expect(first.failed).toBe(1);
    const after = await prisma.user.findUnique({ where: { id: late.id } });
    expect(after.emailSentWelcome).toBe(false);
    (sendTransactionalEmail as jest.Mock).mockClear();
    (sendTransactionalEmail as jest.Mock).mockImplementation(async () => ({ provider: 'resend' }));
    await runOnboardingEmails(now);
    expect(sentTo().filter((s) => s.startsWith(late.email))).toEqual([`${late.email}|onboarding-welcome`]);
  });

  it('"Parar as dicas" stops them with a valid link only', async () => {
    const u = users.day8;
    const bad = await UNSUBSCRIBE(new NextRequest(`http://x/api/email/unsubscribe?u=${u.id}&t=nope`));
    expect(bad.status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: u.id } })).onboardingEmailsOptOut).toBe(false);
    const ok = await UNSUBSCRIBE(new NextRequest(`http://x/api/email/unsubscribe?u=${u.id}&t=${unsubscribeToken(u.id)}`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('as dicas pararam');
    expect((await prisma.user.findUnique({ where: { id: u.id } })).onboardingEmailsOptOut).toBe(true);
  });
});
