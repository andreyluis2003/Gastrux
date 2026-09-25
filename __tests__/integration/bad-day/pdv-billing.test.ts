// @ts-nocheck
/**
 * PDV (card machine / external POS) and Gastrux billing screens, 2026-09-25.
 * Each case states the DESIRED behaviour:
 * - the PDV routes answer the restaurant's managers (they read a session field that never existed and
 *   always answered 401/400), never a cashier, never another restaurant;
 * - a POS sale leaves stock exactly once, even reconciled twice at the same time;
 * - a POS transaction id is unique per restaurant and machine, and card-machine webhooks need their secret;
 * - only the owner subscribes; an abandoned checkout gives no plan; a cancellation stops the plan at
 *   the right moment (at once in the trial, at the end of a paid period) and one trial per owner.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
jest.mock('../../../lib/mercado-pago', () => {
  const actual = jest.requireActual('../../../lib/mercado-pago');
  return { ...actual, createPreApproval: jest.fn(), updatePreApproval: jest.fn() };
});

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { createPreApproval, updatePreApproval } from '../../../lib/mercado-pago';
import { GET as getSettings, POST as createSettings } from '../../../app/api/admin/pos/settings/route';
import { GET as getTransactions } from '../../../app/api/admin/pos/transactions/route';
import { POST as reconcile, GET as reconcileStats } from '../../../app/api/admin/pos/reconcile/route';
import { POST as genericWebhook } from '../../../app/api/admin/pos/webhook/route';
import { POST as stoneWebhook } from '../../../app/api/pos/webhook/stone/route';
import { POST as mpCheckout } from '../../../app/api/billing/mp/checkout-session/route';
import { POST as cancelRoute } from '../../../app/api/conta/subscription/cancel/route';
import { GET as accountSubscription } from '../../../app/api/conta/subscription/route';
import { upsertSubscriptionFromGatewayEvent, expireEndedSubscriptions } from '../../../lib/billing/subscription-sync';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;

describe('PDV and billing screens', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let cashier: any;
  let manager: any;
  let recipe: any;
  let cheese: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const users: string[] = [];

  const as = (userId: string, restaurantId: string) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url: string, method = 'GET', body?: any, headers: Record<string, string> = {}) =>
    new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }) as any;
  const stockOf = async () => (await prisma.stock.findFirst({ where: { restaurantId: A.restaurantId, ingredientId: cheese.id } })).currentQuantity;

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    const mkUser = async (role: string) => {
      const u = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${tag}@pdv.test`, name: role, password: 'x', role, currentRestaurantId: A.restaurantId, active: true } });
      users.push(u.id);
      await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role, isActive: true } });
      return u;
    };
    cashier = await mkUser('CASHIER');
    manager = await mkUser('MANAGER');

    const category = await prisma.ingredientCategory.create({ data: { restaurantId: A.restaurantId, name: `Laticínios ${tag}` } });
    cheese = await prisma.ingredient.create({
      data: { restaurantId: A.restaurantId, code: `ING-${tag}`, name: `Mussarela ${tag}`, categoryId: category.id, standardUnit: 'g', purchaseUnit: 'kg' },
    });
    await prisma.stock.create({ data: { restaurantId: A.restaurantId, ingredientId: cheese.id, currentQuantity: 1000 } });
    recipe = await prisma.recipe.create({
      data: { restaurantId: A.restaurantId, code: `PIZ-${tag}`, name: `Pizza ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 },
    });
    await prisma.recipeIngredient.create({ data: { recipeId: recipe.id, ingredientId: cheese.id, quantity: 150, unit: 'g' } });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    const owners = [A.ownerId, B.ownerId];
    await prisma.pOSTransaction.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.pOSSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.billingInvoice.deleteMany({ where: { userId: { in: owners } } });
    await prisma.user.updateMany({ where: { id: { in: owners } }, data: { subscriptionId: null } });
    await prisma.subscription.deleteMany({ where: { OR: [{ userId: { in: owners } }, { restaurantId: { in: ids } }] } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ restaurantId: { in: ids } }, { userId: { in: users } }] } });
    await prisma.restaurantUser.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(() => jest.clearAllMocks());

  describe('PDV', () => {
    let settingsA: any;
    let settingsB: any;

    it('the owner and managers open the PDV screens; a cashier does not', async () => {
      as(A.ownerId, A.restaurantId);
      const created = await createSettings(req('http://localhost/api/admin/pos/settings', 'POST', { provider: 'GENERIC', autoReconcile: true }));
      expect(created.status).toBe(201);
      settingsA = (await created.json()).settings;

      as(manager.id, A.restaurantId);
      const list = await getSettings();
      expect(list.status).toBe(200);
      expect((await list.json()).settings.map((s: any) => s.id)).toEqual([settingsA.id]);
      expect((await getTransactions(req('http://localhost/api/admin/pos/transactions'))).status).toBe(200);
      expect((await reconcileStats()).status).toBe(200);

      as(cashier.id, A.restaurantId);
      expect((await getSettings()).status).toBe(401);
      expect((await getTransactions(req('http://localhost/api/admin/pos/transactions'))).status).toBe(401);
      expect((await reconcile(req('http://localhost/api/admin/pos/reconcile', 'POST', {}))).status).toBe(403);

      const audit = await prisma.auditLog.findFirst({ where: { restaurantId: A.restaurantId, entityType: 'POSSettings', entityId: settingsA.id } });
      expect(audit).toBeTruthy();
    });

    it('a sale from the card machine leaves stock once, and another restaurant never sees it', async () => {
      const sale = { transactionId: '1', amount: 100, paymentMethod: 'CREDIT', items: [{ name: 'Pizza', quantity: 2, unitPrice: 50, recipeCode: recipe.code }] };
      const first = await genericWebhook(req('http://localhost/api/admin/pos/webhook', 'POST', sale, { 'x-webhook-secret': settingsA.webhookSecret }));
      expect(first.status).toBe(201);
      expect((await first.json()).reconciled).toBe(true);
      expect(await stockOf()).toBe(700); // 1000 - 2 x 150 g

      // The same sale sent again changes nothing
      const again = await genericWebhook(req('http://localhost/api/admin/pos/webhook', 'POST', sale, { 'x-webhook-secret': settingsA.webhookSecret }));
      expect(again.status).toBe(200);
      expect(await stockOf()).toBe(700);

      // Restaurant B's sender also numbers from 1: its sale is its own, not "already processed"
      as(B.ownerId, B.restaurantId);
      const createdB = await createSettings(req('http://localhost/api/admin/pos/settings', 'POST', { provider: 'GENERIC', autoReconcile: false }));
      settingsB = (await createdB.json()).settings;
      const saleB = await genericWebhook(req('http://localhost/api/admin/pos/webhook', 'POST', { ...sale, items: [] }, { 'x-webhook-secret': settingsB.webhookSecret }));
      expect(saleB.status).toBe(201);
      const listB = await (await getTransactions(req('http://localhost/api/admin/pos/transactions'))).json();
      expect(listB.items).toHaveLength(1);
      expect(listB.items[0].restaurantId).toBe(B.restaurantId);
    });

    it('two managers reconciling the same pending sale at once take it out of stock once', async () => {
      const tx = await prisma.pOSTransaction.create({
        data: {
          restaurantId: A.restaurantId, transactionId: `manual-${tag}`, provider: 'GENERIC', amount: 50, netAmount: 50,
          paymentMethod: 'PIX', items: '[]', transactionDate: new Date(),
          saleItems: { create: [{ name: 'Pizza', quantity: 1, unitPrice: 50, totalPrice: 50, recipeId: recipe.id }] },
        },
      });
      const before = await stockOf();
      as(A.ownerId, A.restaurantId);
      const results = await Promise.all([
        reconcile(req('http://localhost/api/admin/pos/reconcile', 'POST', { transactionIds: [tx.id] })),
        reconcile(req('http://localhost/api/admin/pos/reconcile', 'POST', { transactionIds: [tx.id] })),
      ]);
      const bodies = await Promise.all(results.map((r) => r.json()));
      expect(bodies.reduce((n, b) => n + b.reconciled, 0)).toBe(1);
      expect(await stockOf()).toBe(before - 150);
      const movements = await prisma.stockMovement.count({ where: { referenceId: tx.id, referenceType: 'POS_TRANSACTION' } });
      expect(movements).toBe(1);
    });

    it('the Stone webhook needs its secret and cannot overwrite another restaurant\'s sale', async () => {
      await prisma.pOSSettings.create({ data: { restaurantId: A.restaurantId, provider: 'STONE', stoneStoneCode: `SC-${tag}`, webhookSecret: 'secret-a', isConfigured: true } });
      const payload = { id: '1', amount: 999, stone_code: `SC-${tag}`, status: 'APPROVED' };

      const unsigned = await stoneWebhook(req('http://localhost/api/pos/webhook/stone', 'POST', payload));
      expect(unsigned.status).toBe(401);
      const wrong = await stoneWebhook(req('http://localhost/api/pos/webhook/stone', 'POST', payload, { 'x-stone-signature': 'nope' }));
      expect(wrong.status).toBe(401);

      const signed = await stoneWebhook(req('http://localhost/api/pos/webhook/stone', 'POST', payload, { 'x-stone-signature': 'secret-a' }));
      expect(signed.status).toBe(200);

      // Neither restaurant B's sale "1" nor A's own card-machine sale "1" is touched by A's Stone sale "1"
      const bSale = await prisma.pOSTransaction.findUnique({ where: { restaurantId_provider_transactionId: { restaurantId: B.restaurantId, provider: 'GENERIC', transactionId: '1' } } });
      expect(Number(bSale.amount)).toBe(100);
      const aStone = await prisma.pOSTransaction.findFirst({ where: { restaurantId: A.restaurantId, provider: 'STONE', transactionId: '1' } });
      expect(Number(aStone.amount)).toBe(999);
      const aGeneric = await prisma.pOSTransaction.findFirst({ where: { restaurantId: A.restaurantId, provider: 'GENERIC', transactionId: '1' } });
      expect(Number(aGeneric.amount)).toBe(100);
    });
  });

  describe('billing', () => {
    const tierOf = async (restaurantId: string) =>
      (await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } })).subscriptionTier;
    const checkout = () => mpCheckout(req('http://localhost/api/billing/mp/checkout-session', 'POST', { tierId: 'business', billing: 'monthly' }));
    const mpEvent = (sub: any, status: any, extra: any = {}) =>
      upsertSubscriptionFromGatewayEvent({
        gateway: 'MERCADO_PAGO', gatewaySubscriptionId: sub.gatewaySubscriptionId, userId: sub.userId, restaurantId: sub.restaurantId,
        tier: sub.tier, planName: sub.planName, billingCycle: 'monthly', amount: Number(sub.amount), status,
        trialStart: sub.trialStart, trialEnd: sub.trialEnd, ...extra,
      });

    beforeAll(async () => {
      await prisma.restaurant.updateMany({ where: { id: { in: [A.restaurantId, B.restaurantId] } }, data: { subscriptionTier: 'starter', subscriptionStatus: 'active' } });
    });

    it('only the owner subscribes, and the subscription belongs to the restaurant being worked in', async () => {
      (createPreApproval as jest.Mock).mockResolvedValue({ id: `pre-${tag}-1`, init_point: 'https://mp.test/checkout' });

      as(manager.id, A.restaurantId);
      const denied = await checkout();
      expect(denied.status).toBe(403);
      expect(createPreApproval).not.toHaveBeenCalled();

      as(A.ownerId, A.restaurantId);
      const res = await checkout();
      expect(res.status).toBe(200);
      const sub = await prisma.subscription.findFirst({ where: { gatewaySubscriptionId: `pre-${tag}-1` } });
      expect(sub.restaurantId).toBe(A.restaurantId);
      expect(sub.userId).toBe(A.ownerId);
      expect(sub.trialEnd.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
      expect((createPreApproval as jest.Mock).mock.calls[0][0].autoRecurring.freeTrial).toEqual({ frequency: 30, frequencyType: 'days' });
    });

    it('a checkout opened and abandoned gives no plan; the authorized one does', async () => {
      const sub = await prisma.subscription.findFirst({ where: { gatewaySubscriptionId: `pre-${tag}-1` } });
      await mpEvent(sub, 'incomplete'); // Mercado Pago "pending": no card authorized
      expect(await tierOf(A.restaurantId)).toBe('starter');

      await mpEvent(sub, 'active'); // "authorized", inside the free trial
      expect(await tierOf(A.restaurantId)).toBe('business');
      const stored = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(stored.status).toBe('trialing');

      // A second subscription while this one is active is refused
      as(A.ownerId, A.restaurantId);
      expect((await checkout()).status).toBe(409);

      as(manager.id, A.restaurantId);
      const view = await (await accountSubscription()).json();
      expect(view.subscription.id).toBe(sub.id);
      expect(view.canCancel).toBe(false);
      as(cashier.id, A.restaurantId);
      expect((await accountSubscription()).status).toBe(403);
    });

    it('canceling during the trial ends the plan at once; a new subscription gets no second trial', async () => {
      as(manager.id, A.restaurantId);
      expect((await cancelRoute()).status).toBe(403);

      as(A.ownerId, A.restaurantId);
      const res = await cancelRoute();
      expect(res.status).toBe(200);
      expect((await res.json()).accessUntil).toBeNull();
      expect(updatePreApproval).toHaveBeenCalledWith(`pre-${tag}-1`, 'cancelled');
      expect(await tierOf(A.restaurantId)).toBe('starter');

      (createPreApproval as jest.Mock).mockResolvedValue({ id: `pre-${tag}-2`, init_point: 'https://mp.test/checkout' });
      expect((await checkout()).status).toBe(200);
      const second = await prisma.subscription.findFirst({ where: { gatewaySubscriptionId: `pre-${tag}-2` } });
      expect(second.trialEnd).toBeNull();
      expect((createPreApproval as jest.Mock).mock.calls[0][0].autoRecurring.freeTrial).toBeUndefined();
    });

    it('canceling a paid month keeps the plan until the month ends, then it goes back to Starter', async () => {
      const second = await prisma.subscription.findFirst({ where: { gatewaySubscriptionId: `pre-${tag}-2` } });
      const periodEnd = new Date(Date.now() + 10 * DAY);
      await mpEvent(second, 'active', { currentPeriodStart: new Date(Date.now() - 20 * DAY), currentPeriodEnd: periodEnd });
      expect(await tierOf(A.restaurantId)).toBe('business');

      as(A.ownerId, A.restaurantId);
      const res = await cancelRoute();
      expect(res.status).toBe(200);
      expect(new Date((await res.json()).accessUntil).getTime()).toBe(periodEnd.getTime());
      expect(await tierOf(A.restaurantId)).toBe('business');

      // Mercado Pago confirms the cancellation later: still until the end of the paid month
      const canceled = await prisma.subscription.findUnique({ where: { id: second.id } });
      await mpEvent(canceled, 'canceled');
      expect(await tierOf(A.restaurantId)).toBe('business');

      expect(await expireEndedSubscriptions(new Date(Date.now() + 5 * DAY))).toBe(0);
      expect(await expireEndedSubscriptions(new Date(Date.now() + 11 * DAY))).toBe(1);
      expect(await tierOf(A.restaurantId)).toBe('starter');
      expect(await expireEndedSubscriptions(new Date(Date.now() + 12 * DAY))).toBe(0);
    });
  });
});
