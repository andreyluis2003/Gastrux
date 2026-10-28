// @ts-nocheck
/**
 * What the activation agent reads off the database (spec 2026-10-27): which accounts are in trial,
 * and for each one the steps done, the last activity and whether it must be left alone.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { listTrialRestaurantIds, loadActivationSignals } from '../../../lib/agents/activation/signals';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const DAY = 86_400_000;

async function account(opts: { internal?: boolean; optOut?: boolean; createdAt?: Date } = {}) {
  const tag = crypto.randomBytes(4).toString('hex');
  const owner = await prisma.user.create({
    data: { email: `act-sig-${tag}@gastrux.test`, name: 'Maria Silva', role: 'OWNER', whatsapp: '5566999998888', businessType: 'pizzaria', onboardingEmailsOptOut: !!opts.optOut, lastSignInAt: new Date(Date.now() - 5 * DAY) },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Pizzaria ${tag}`, ownerId: owner.id, status: 'TRIAL', subscriptionStatus: 'trialing', timezone: 'America/Cuiaba',
      isInternal: !!opts.internal, trialEndsAt: new Date(Date.now() + 10 * DAY), createdAt: opts.createdAt ?? new Date(Date.now() - 4 * DAY),
    },
  });
  await prisma.user.update({ where: { id: owner.id }, data: { currentRestaurantId: restaurant.id } });
  return { owner, restaurant };
}

describe('activation signals', () => {
  const made: any[] = [];
  afterAll(async () => {
    for (const a of made) {
      await prisma.restaurant.delete({ where: { id: a.restaurant.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: a.owner.id } }).catch(() => {});
    }
  });

  it('lists trial accounts of the last 40 days, never internal ones', async () => {
    const trial = await account(); made.push(trial);
    const internal = await account({ internal: true }); made.push(internal);
    const old = await account({ createdAt: new Date(Date.now() - 41 * DAY) }); made.push(old);
    const ids = await listTrialRestaurantIds(new Date());
    expect(ids).toContain(trial.restaurant.id);
    expect(ids).not.toContain(internal.restaurant.id);
    expect(ids).not.toContain(old.restaurant.id);
  });

  it('reads the steps, the last activity and the contact', async () => {
    const a = await account(); made.push(a);
    const closedAt = new Date(Date.now() - DAY);
    const reg = await prisma.cashRegister.create({ data: { restaurantId: a.restaurant.id, name: 'Caixa principal', isDefault: true } });
    await prisma.cashSession.create({ data: { restaurantId: a.restaurant.id, cashRegisterId: reg.id, openedById: a.owner.id } });
    await prisma.orderSession.create({ data: { restaurantId: a.restaurant.id, userId: a.owner.id, status: 'CLOSED', closedAt } });
    await prisma.agentAction.create({ data: { restaurantId: a.restaurant.id, userId: a.owner.id, trigger: 'boas_vindas', channel: 'EMAIL', status: 'SENT', text: 'Oi', data: { stepsDone: 0 } } });

    const s = await loadActivationSignals(a.restaurant.id, new Date());
    expect(s).toMatchObject({
      restaurantId: a.restaurant.id, ownerId: a.owner.id, ownerName: 'Maria Silva', whatsapp: '5566999998888',
      businessType: 'pizzaria', timezone: 'America/Cuiaba', status: 'TRIAL', stage: 'SELLING', excluded: false,
    });
    expect(s.email).toBe(a.owner.email);
    expect(s.steps.find((x) => x.key === 'venda').done).toBe(true);
    expect(s.stepsDone).toBe(2);
    expect(s.lastActivityAt.getTime()).toBe(closedAt.getTime());
    expect(s.sent).toEqual([{ trigger: 'boas_vindas', createdAt: expect.any(Date), stepsDone: 0 }]);
  });

  it('an owner who asked to stop the tips is excluded', async () => {
    const a = await account({ optOut: true }); made.push(a);
    expect((await loadActivationSignals(a.restaurant.id, new Date())).excluded).toBe(true);
  });

  it('an unknown restaurant gives null', async () => {
    expect(await loadActivationSignals('nope', new Date())).toBeNull();
  });
});
