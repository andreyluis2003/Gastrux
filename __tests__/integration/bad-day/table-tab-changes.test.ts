// @ts-nocheck
/**
 * "Bad day" scenario 5 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * the table tab changes (item removed, modifier added, price changed) around the moment its PIX is
 * generated or paid, and the bill is to be split. Each case states the DESIRED behaviour: the amount
 * charged is what the tab really costs, a QR that no longer matches the tab cannot be paid by mistake,
 * money received for a tab that changed does not go unnoticed, and split parts always add up to the
 * total to the cent. A case that documents a known gap is `it.failing`; a feature that does not exist
 * yet is `it.todo`.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/connection-service', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/connection-service'),
  getMpClientForRestaurant: jest.fn().mockResolvedValue({ fake: 'client' }),
}));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  cancelConnectPayment: jest.fn().mockResolvedValue({}),
  getConnectPayment: jest.fn(),
}));

import { createConnectPix, cancelConnectPayment, getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';
import { POST as pixRoute } from '../../../app/api/pagamentos/mp/pix/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 5: the table tab changes around its PIX', () => {
  let A: { restaurantId: string; ownerId: string };
  let table: any;
  let session: any;
  let burger: any;
  let drink: any;
  let cheese: any;
  const tag = crypto.randomBytes(3).toString('hex');
  let mpSeq = 9000;

  const wipe = async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { OR: [{ restaurantId: A.restaurantId }, { userId: A.ownerId }] } });
    await prisma.orderSessionItem.deleteMany({ where: { sessionId: session.id } });
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA;
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Salão ${tag}`, capacity: 20 } });
    table = await prisma.table.create({
      data: { restaurantId: A.restaurantId, number: 7, sectionId: section.id, capacity: 4, qrToken: `qr-${tag}` },
    });
    session = await prisma.orderSession.create({
      data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, status: 'OPEN', tableNumber: 7 },
    });
    const mk = (name: string) =>
      prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${crypto.randomBytes(3).toString('hex')}`, name: `${name} ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    burger = await mk('Hambúrguer');
    drink = await mk('Refrigerante');
    cheese = await prisma.itemModifier.create({ data: { restaurantId: A.restaurantId, name: `Queijo extra ${tag}`, priceAdjustment: 3 } });
  });

  afterAll(async () => {
    await wipe();
    await prisma.orderSession.deleteMany({ where: { id: session.id } });
    await prisma.itemModifier.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.recipe.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.table.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.tableSection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await wipe();
    createConnectPix.mockImplementation(async (_client, input) => {
      const id = ++mpSeq;
      return {
        id,
        status: 'pending',
        date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
        point_of_interaction: { transaction_data: { qr_code: `qr-${id}`, qr_code_base64: 'b64', ticket_url: `https://mp/${id}` } },
      };
    });
  });

  /** Adds a tab line and returns it. `mods` are ItemModifier rows attached to the line. */
  const addLine = async (recipe: any, price: number, quantity = 1, mods: any[] = []) => {
    const item = await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: recipe.id, price, quantity } });
    for (const m of mods) {
      await prisma.orderSessionItemModifier.create({ data: { sessionItemId: item.id, modifierId: m.id, priceAdjustment: m.priceAdjustment } });
    }
    return item;
  };
  const askPix = async () => {
    const res = await pixRoute(
      new Request('http://localhost/api/pagamentos/mp/pix', {
        method: 'POST',
        body: JSON.stringify({ qrToken: table.qrToken, payerEmail: 'cliente@x.test' }),
      }) as any
    );
    return { status: res.status, body: await res.json() };
  };
  const paymentsOfTab = () => prisma.payment.findMany({ where: { restaurantId: A.restaurantId }, orderBy: { createdAt: 'asc' } });
  const alerts = () => prisma.notification.findMany({ where: { restaurantId: A.restaurantId } });

  describe('the amount charged is what the tab costs', () => {
    it('charges (price + modifiers) x quantity for every line: the surcharge applies to EACH unit (owner rule)', async () => {
      await addLine(burger, 30, 2, [cheese]); // 2 x (30 + 3)
      await addLine(drink, 8.5, 3); // 3 x 8.50

      const { status, body } = await askPix();

      expect(status).toBe(200);
      expect(body.amount).toBe(91.5);
      expect(createConnectPix.mock.calls[0][1].amount).toBe(91.5);
    });

    it('sums in cents: 3 x 0.10 charges 0.30, not 0.30000000000000004', async () => {
      await addLine(drink, 0.1, 3);

      const { body } = await askPix();

      expect(body.amount).toBe(0.3);
    });

    it('a later price change in the menu or in the modifier does not change a tab already launched', async () => {
      await addLine(burger, 30, 1, [cheese]);
      await prisma.itemModifier.update({ where: { id: cheese.id }, data: { priceAdjustment: 9 } });
      await prisma.recipe.update({ where: { id: burger.id }, data: { name: `Hambúrguer ${tag} (novo)` } });

      const { body } = await askPix();

      expect(body.amount).toBe(33);
      await prisma.itemModifier.update({ where: { id: cheese.id }, data: { priceAdjustment: 3 } });
    });

    it('an item removed and a modifier added after a PIX was generated: a NEW PIX is generated for the new total', async () => {
      const line = await addLine(burger, 30);
      const first = await askPix();
      expect(first.body.amount).toBe(30);

      await prisma.orderSessionItemModifier.create({ data: { sessionItemId: line.id, modifierId: cheese.id, priceAdjustment: 3 } });
      const second = await askPix();

      expect(second.body.amount).toBe(33);
      expect(second.body.paymentId).not.toBe(first.body.paymentId);
      expect(createConnectPix).toHaveBeenCalledTimes(2);
    });

    it('asking again with the SAME tab reuses the same PIX (no second charge)', async () => {
      await addLine(burger, 30);

      const first = await askPix();
      const again = await askPix();

      expect(again.body.paymentId).toBe(first.body.paymentId);
      expect(createConnectPix).toHaveBeenCalledTimes(1);
    });
  });

  describe('a QR code that no longer matches the tab', () => {
    // GAP S5-1: a new PIX for a different total is created, but the OLD one stays PENDING and payable at
    // Mercado Pago until it expires: the customer can still pay the stale (wrong) amount.
    it.failing('the old PIX is cancelled (here and at Mercado Pago) when a new one is generated for a different total (S5-1)', async () => {
      const line = await addLine(burger, 30);
      const first = await askPix();
      const firstPayment = await prisma.payment.findUnique({ where: { id: first.body.paymentId } });
      await prisma.orderSessionItemModifier.create({ data: { sessionItemId: line.id, modifierId: cheese.id, priceAdjustment: 3 } });

      await askPix();

      expect((await prisma.payment.findUnique({ where: { id: firstPayment.id } })).status).toBe('CANCELLED');
      expect(cancelConnectPayment).toHaveBeenCalledWith({ fake: 'client' }, firstPayment.gatewayPaymentId);
    });

    // GAP S5-2: the stale PIX is paid: the payment is APPROVED for the OLD amount, the tab is now higher and
    // nothing links the payment to the tab, so nobody is told that part of the tab is still open.
    it.failing('a PIX paid for an OLD total raises an alert saying the tab is not fully covered (S5-2)', async () => {
      const line = await addLine(burger, 30);
      const first = await askPix();
      const stale = await prisma.payment.findUnique({ where: { id: first.body.paymentId } });
      await prisma.orderSessionItemModifier.create({ data: { sessionItemId: line.id, modifierId: cheese.id, priceAdjustment: 3 } });
      getConnectPayment.mockResolvedValue({
        id: Number(stale.gatewayPaymentId), status: 'approved', status_detail: 'accredited',
        external_reference: stale.id, transaction_amount: 30, fee_details: [],
      });

      await syncRestaurantPayment(A.restaurantId, stale.gatewayPaymentId);

      expect((await prisma.payment.findUnique({ where: { id: stale.id } })).status).toBe('APPROVED');
      expect((await alerts()).length).toBeGreaterThan(0);
    });

    it('a stale PIX is not reused after the tab total changed (only the same amount is reused)', async () => {
      await addLine(burger, 30);
      const first = await askPix();
      await addLine(drink, 8);

      const second = await askPix();

      expect(second.body.paymentId).not.toBe(first.body.paymentId);
      expect(second.body.amount).toBe(38);
      expect((await paymentsOfTab()).map((p) => Number(p.amount))).toEqual([30, 38]);
    });
  });

  describe('paying the tab', () => {
    it.todo('a table PIX approval marks the tab as paid or notifies the waiter (today the approval never reaches the OrderSession: it has no paid marker, so the waiter must find the payment by hand)');
    it.todo('the tab shows "paid so far / remaining" when a payment covers only part of it');
  });

  describe('splitting the bill (a product gap: the feature does not exist)', () => {
    it.todo('equal split among N people: the parts add up to the total to the cent (largest-remainder rounding, never 3 x 33.33 for 100.00)');
    it.todo('split by item: each person pays their own lines and shared lines are divided, parts add up to the total');
    it.todo('split by value: parts typed by the waiter must add up to the tab; a difference is refused, not absorbed');
    it.todo('a tab total changed after a partial payment: the remaining balance is recomputed and no part is paid twice');
    it.todo('one PIX per part, each tied to the tab; the tab closes only when the approved parts cover the total; a part paid twice is flagged');
  });
});
