// @ts-nocheck
/** Processing the stored 99Food webhook events into delivery orders (plan 2026-11-09 99food, Task 4) */
jest.mock('../../../lib/ninetynine/client', () => ({
  ...jest.requireActual('../../../lib/ninetynine/client'),
  getOrderDetail: jest.fn(),
  confirmOrder: jest.fn(),
}));

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { confirmOrder, getOrderDetail } from '../../../lib/ninetynine/client';
import { processNinetynineEvent, processPendingOnce } from '../../../lib/ninetynine/events';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
// 19-digit ids, unique per run
const bigId = () => `57646${String(Date.now()).slice(-8)}${String(100000 + seq++).slice(-6)}`;

function orderInfo(orderId: string, extra = {}) {
  return {
    order_id: orderId, order_index: 42, status: 100, delivery_type: 1, fulfillment_mode: 0,
    pay_type: 1, pay_method: 1, pay_channel: 212,
    price: { order_price: 6000, delivery_price: 900, others_fees: {} },
    receive_address: { name: 'Maria', first_name: 'Maria', virtual_phone_number: '00016004812', locator: '4321' },
    order_items: [{ name: 'Pizza', amount: 2, sku_price: 3000, total_price: 6000, app_item_id: 'PZ1' }],
    ...extra,
  };
}

describe('99Food events', () => {
  const made = [];
  const events = [];

  async function restaurant(extra = {}, integ: any = {}) {
    // pausedUntil lives on the 99Food-only state table, not on delivery_integrations
    const { pausedUntil, ...integFields } = integ;
    const owner = await prisma.user.create({ data: { email: `nne-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    const r = await prisma.restaurant.create({ data: { name: `Nne ${seq++} ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false, ...extra } });
    const appShopId = bigId();
    const integration = await prisma.deliveryIntegration.create({ data: { restaurantId: r.id, platform: 'ninety_nine_food', apiKey: 'x', webhookSecret: 'y', storeId: appShopId, ...integFields } });
    if (pausedUntil !== undefined) await prisma.ninetynineStoreState.create({ data: { integrationId: integration.id, pausedUntil } });
    await prisma.recipe.create({ data: { restaurantId: r.id, code: `R${tag}${seq++}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    made.push({ rid: r.id, ownerId: owner.id });
    return { rid: r.id, integ: integration, appShopId };
  }

  let clock = Date.now() - 60_000;
  async function event(type: string, appShopId: string | null, data: any, opts: { timestamp?: number } = {}) {
    const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000) + seq;
    const id = `nn-${tag}-${seq++}`;
    const payload = { app_id: '5764607523034234880', ...(appShopId ? { app_shop_id: appShopId } : {}), type, timestamp, data };
    const row = await prisma.ninetynineEvent.create({
      data: { id, type, appShopId, orderId: data?.order_id ?? null, payload, receivedAt: new Date((clock += 10)) },
    });
    events.push(id);
    return row;
  }
  const extOf = (orderId) => prisma.externalOrder.findFirst({ where: { externalOrderId: orderId } });
  const rowOf = (id) => prisma.ninetynineEvent.findUnique({ where: { id } });

  // A lease left by an earlier, interrupted run would skip every run here
  beforeAll(() => prisma.pollLease.deleteMany({ where: { name: 'ninetynine-events' } }));
  beforeEach(() => {
    getOrderDetail.mockReset();
    confirmOrder.mockReset();
    confirmOrder.mockResolvedValue({ requestId: 'req-1' });
  });
  afterAll(async () => {
    await prisma.ninetynineEvent.deleteMany({ where: { id: { startsWith: `nn-${tag}` } } }).catch(() => {});
    for (const m of made) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.order.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: m.rid } }); } catch {}
      try { await prisma.user.delete({ where: { id: m.ownerId } }); } catch {}
    }
  });

  it('deletes processed events older than 30 days (first run of the day)', async () => {
    const old = await prisma.ninetynineEvent.create({
      data: { id: `nn-${tag}-old`, type: 'orderFinish', payload: {}, receivedAt: new Date(Date.now() - 31 * 86400e3), processedAt: new Date(Date.now() - 31 * 86400e3) },
    });
    await processPendingOnce();
    expect(await rowOf(old.id)).toBeNull();
  });

  it('duplicate orderNew: one order, one confirm, 19-digit id preserved', async () => {
    const r = await restaurant();
    const orderId = bigId();
    const e1 = await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    const e2 = await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    const res = await processPendingOnce();
    expect(res.failed).toBe(0);
    expect(await prisma.externalOrder.count({ where: { externalOrderId: orderId } })).toBe(1);
    const ext = await extOf(orderId);
    expect(ext.externalOrderId).toBe(orderId);
    expect(ext.externalOrderId).toHaveLength(19);
    expect(ext.status).toBe('CONFIRMED');
    expect(ext.platformConfirmedAt).not.toBeNull();
    expect(await prisma.order.count({ where: { externalOrderId: ext.id } })).toBe(1);
    expect(confirmOrder).toHaveBeenCalledTimes(1);
    expect(confirmOrder).toHaveBeenCalledWith(r.integ.id, orderId);
    expect((await rowOf(e1.id)).processedAt).not.toBeNull();
    expect((await rowOf(e2.id)).processedAt).not.toBeNull();
    expect(getOrderDetail).not.toHaveBeenCalled();
  });

  it('orderNew without order_info fetches the detail', async () => {
    const r = await restaurant();
    const orderId = bigId();
    getOrderDetail.mockResolvedValue({ order_id: orderId, order_info: orderInfo(orderId) });
    await event('orderNew', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    expect(getOrderDetail).toHaveBeenCalledWith(r.integ.id, orderId);
    expect((await extOf(orderId)).status).toBe('CONFIRMED');
  });

  it('manual accept: not confirmed on 99Food, rings again at 3 minutes', async () => {
    const r = await restaurant({ deliveryAutoAccept: false });
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect(ext.status).toBe('PENDING');
    expect(confirmOrder).not.toHaveBeenCalled();
    expect(await prisma.notification.count({ where: { restaurantId: r.rid, title: 'Novo pedido de delivery' } })).toBe(1);

    await prisma.externalOrder.update({ where: { id: ext.id }, data: { orderReceivedAt: new Date(Date.now() - 3.5 * 60e3) } });
    await processPendingOnce({ sweep: true });
    await processPendingOnce({ sweep: true });
    const second =await prisma.notification.findMany({ where: { restaurantId: r.rid, data: { path: ['problem'], equals: 'ninetynine-waiting-2' } } });
    expect(second).toHaveLength(1);
    expect(second[0].message).toBe('Pedido da 99Food #42 esperando há 3 min — confirme antes de 5 min');
  });

  it('orderConfirm from the 99Food app accepts without confirming again', async () => {
    const r = await restaurant({ deliveryAutoAccept: false });
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await event('orderConfirm', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect(ext.status).toBe('CONFIRMED');
    expect(ext.platformConfirmedAt).not.toBeNull();
    expect(confirmOrder).not.toHaveBeenCalled();
    expect(await prisma.order.count({ where: { externalOrderId: ext.id } })).toBe(1);
  });

  it('orderReady and orderFinish move forward only', async () => {
    const r = await restaurant();
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await event('orderFinish', r.appShopId, { order_id: orderId });
    await event('orderReady', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    expect((await extOf(orderId)).status).toBe('DELIVERED');
  });

  it('orderCancel cancels the kitchen order', async () => {
    const r = await restaurant();
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect((await prisma.order.findUnique({ where: { externalOrderId: ext.id } })).status).not.toBe('CANCELLED');
    await event('orderCancel', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    expect((await extOf(orderId)).status).toBe('CANCELLED');
    expect((await prisma.order.findUnique({ where: { externalOrderId: ext.id } })).status).toBe('CANCELLED');
    expect(await prisma.notification.count({ where: { restaurantId: r.rid, data: { path: ['problem'], equals: 'ninetynine-cancelled' } } })).toBe(1);
  });

  it('cancel apply sets the dispute once across resends', async () => {
    const r = await restaurant();
    const orderId = bigId();
    const applyId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    const t0 = Math.floor(Date.now() / 1000);
    const reasons = [{ reason_id: 1, reason: 'Demorou' }];
    await event('orderCancelApply', r.appShopId, { order_id: orderId, apply_id: applyId, apply_reason: 'Demorou', reason_list: reasons }, { timestamp: t0 });
    await event('orderCancelApply', r.appShopId, { order_id: orderId, apply_id: applyId, apply_reason: 'Demorou', reason_list: reasons }, { timestamp: t0 + 30 });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect(ext.disputeId).toBe(applyId);
    expect(ext.disputeExpiresAt.getTime()).toBe((t0 + 300) * 1000);
    expect(ext.platformData.disputeKind).toBe('cancel');
    expect(ext.platformData.disputeReasons).toEqual(reasons);
    expect(ext.platformData.orderIndex).toBe(42);
    expect(await prisma.notification.count({ where: { restaurantId: r.rid, title: 'Pedido de cancelamento na 99Food' } })).toBe(1);
  });

  it('refund apply: kind refund, base reasons, 25 h', async () => {
    const r = await restaurant();
    const orderId = bigId();
    const applyId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    const t0 = Math.floor(Date.now() / 1000);
    const base = [{ base_reason_id: '11', base_reason: 'Item entregue' }];
    await event('orderRefundApply', r.appShopId, { order_id: orderId, apply_id: applyId, apply_reason: 'Faltou item', base_reason_list: base }, { timestamp: t0 });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect(ext.disputeId).toBe(applyId);
    expect(ext.disputeExpiresAt.getTime()).toBe((t0 + 25 * 3600) * 1000);
    expect(ext.platformData.disputeKind).toBe('refund');
    expect(ext.platformData.disputeReasons).toEqual(base);
  });

  it('a store paused (from Gastrux or on the 99Food) still takes the orders the 99Food sends', async () => {
    const r = await restaurant({}, { pausedUntil: new Date(Date.now() + 3600_000), syncStatus: 'PARTIAL', syncError: 'Loja pausada na 99Food' });
    const orderId = bigId();
    const ev = await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    expect((await rowOf(ev.id)).error).toBeNull();
    expect(await extOf(orderId)).not.toBeNull();
    expect(confirmOrder).toHaveBeenCalledWith(r.integ.id, orderId);
  });

  it('unknown or switched-off (isActive false) store: not ingested, processed with a note', async () => {
    const orderId = bigId();
    const unknown = await event('orderNew', bigId(), { order_id: orderId, order_info: orderInfo(orderId) });
    const r = await restaurant({}, { isActive: false });
    const other = bigId();
    const paused = await event('orderNew', r.appShopId, { order_id: other, order_info: orderInfo(other) });
    const locked = await restaurant({ status: 'SUSPENDED', subscriptionStatus: 'canceled' });
    const third = bigId();
    const lockedEv = await event('orderNew', locked.appShopId, { order_id: third, order_info: orderInfo(third) });
    await processPendingOnce();
    for (const [ev, oid] of [[unknown, orderId], [paused, other], [lockedEv, third]]) {
      const row = await rowOf(ev.id);
      expect(row.processedAt).not.toBeNull();
      expect(row.error).toBeTruthy();
      expect(await extOf(oid)).toBeNull();
    }
    expect(confirmOrder).not.toHaveBeenCalled();
  });

  it('a failing orderNew backs off, then gives up at 4.5 min with "Confirme no app da 99Food"', async () => {
    const r = await restaurant();
    const orderId = bigId();
    getOrderDetail.mockRejectedValue(new Error('99Food fora do ar'));
    const ev = await event('orderNew', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    let row = await rowOf(ev.id);
    expect(row.attempts).toBe(1);
    expect(row.processedAt).toBeNull();
    expect(row.error).toContain('99Food fora do ar');
    const wait = row.nextAttemptAt.getTime() - Date.now();
    expect(wait).toBeGreaterThan(2_000);
    expect(wait).toBeLessThanOrEqual(5_000);
    // not due yet: not tried again
    await processPendingOnce();
    expect(getOrderDetail).toHaveBeenCalledTimes(1);
    // due again, second failure: 10 s
    await prisma.ninetynineEvent.update({ where: { id: ev.id }, data: { nextAttemptAt: new Date(Date.now() - 1) } });
    await processPendingOnce();
    row = await rowOf(ev.id);
    expect(row.attempts).toBe(2);
    expect(row.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(7_000);
    // 4.5 minutes after it arrived: given up, a person confirms in the 99Food app
    await prisma.ninetynineEvent.update({ where: { id: ev.id }, data: { nextAttemptAt: null, receivedAt: new Date(Date.now() - 4.6 * 60e3) } });
    await processPendingOnce();
    row = await rowOf(ev.id);
    expect(row.attempts).toBe(3);
    expect(row.processedAt).not.toBeNull();
    const alert = await prisma.notification.findFirst({ where: { restaurantId: r.rid, data: { path: ['problem'], equals: 'ninetynine-order-not-in' } } });
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.message).toContain('Confirme no app da 99Food');
    await processPendingOnce();
    expect(getOrderDetail).toHaveBeenCalledTimes(3);
  });

  it('a failing order event retries until 30 min, then alerts', async () => {
    const r = await restaurant();
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    getOrderDetail.mockRejectedValue(new Error('99Food fora do ar'));
    const ev = await event('orderPartialCancel', r.appShopId, { order_id: orderId });
    await prisma.ninetynineEvent.update({ where: { id: ev.id }, data: { receivedAt: new Date(Date.now() - 20 * 60e3) } });
    await processPendingOnce();
    expect((await rowOf(ev.id)).processedAt).toBeNull();
    await prisma.ninetynineEvent.update({ where: { id: ev.id }, data: { nextAttemptAt: null, receivedAt: new Date(Date.now() - 31 * 60e3) } });
    await processPendingOnce();
    expect((await rowOf(ev.id)).processedAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { restaurantId: r.rid, data: { path: ['problem'], equals: 'ninetynine-event-failed' } } })).toBe(1);
  });

  it('nothing the kitchen knows: not accepted nor confirmed, a person decides', async () => {
    const r = await restaurant();
    await prisma.recipe.deleteMany({ where: { restaurantId: r.rid } });
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    expect((await extOf(orderId)).status).toBe('PENDING');
    expect(confirmOrder).not.toHaveBeenCalled();
    const alert = await prisma.notification.findFirst({ where: { restaurantId: r.rid, severity: 'CRITICAL' } });
    expect(alert.title).toBe('Pedido da 99Food não foi confirmado');
    expect(alert.message).toContain('a 99Food cancela em 5 minutos');
  });

  it('partial cancel updates the items and values (order and kitchen), one note and one alert per event', async () => {
    const r = await restaurant();
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    const after = orderInfo(orderId, { price: { order_price: 3000, delivery_price: 900, others_fees: {} }, order_items: [{ name: 'Pizza', amount: 1, sku_price: 3000, total_price: 3000, app_item_id: 'PZ1' }] });
    getOrderDetail.mockResolvedValue({ order_id: orderId, order_info: after });
    const t = Math.floor(Date.now() / 1000);
    await event('orderPartialCancel', r.appShopId, { order_id: orderId }, { timestamp: t });
    await processPendingOnce();
    // the same 99Food event delivered again (another row): no second note, no second alert
    await event('orderPartialCancel', r.appShopId, { order_id: orderId }, { timestamp: t });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect(ext.subtotal).toBe(30);
    expect(ext.totalAmount).toBe(30);
    expect(JSON.parse(ext.items)).toEqual([expect.objectContaining({ name: 'Pizza', quantity: 1, price: 30 })]);
    expect(ext.specialInstructions.match(/A 99Food tirou itens: ficou 1x Pizza/g)).toHaveLength(1);
    const kitchen = await prisma.order.findUnique({ where: { externalOrderId: ext.id } });
    expect(Number(kitchen.subtotal)).toBe(30);
    expect(Number(kitchen.total)).toBe(30);
    expect(kitchen.specialInstructions).toContain('A 99Food tirou itens: ficou 1x Pizza');
    const alerts = await prisma.notification.findMany({ where: { restaurantId: r.rid, title: 'A 99Food tirou itens de um pedido' } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe('A 99Food tirou itens do pedido #42');
  });

  it('events of an order already in Gastrux are followed even after the store is paused', async () => {
    const r = await restaurant();
    const orderId = bigId();
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    await prisma.deliveryIntegration.update({ where: { id: r.integ.id }, data: { isActive: false } });
    await event('orderCancel', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    expect((await extOf(orderId)).status).toBe('CANCELLED');
  });

  it('orderConfirm and orderFinish that came before their orderNew are applied when it lands', async () => {
    const r = await restaurant({ deliveryAutoAccept: false });
    const orderId = bigId();
    const c = await event('orderConfirm', r.appShopId, { order_id: orderId });
    await processPendingOnce();
    expect((await rowOf(c.id)).error).toBe('pedido ainda não está no Gastrux');
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce();
    const ext = await extOf(orderId);
    expect(ext.status).toBe('CONFIRMED');
    expect(ext.platformConfirmedAt).not.toBeNull();
    expect(confirmOrder).not.toHaveBeenCalled();
    const row = await rowOf(c.id);
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toBeNull();

    const other = bigId();
    const f = await event('orderFinish', r.appShopId, { order_id: other });
    await processPendingOnce();
    await event('orderNew', r.appShopId, { order_id: other, order_info: orderInfo(other) });
    await processPendingOnce();
    expect((await extOf(other)).status).toBe('DELIVERED');
    expect((await rowOf(f.id)).error).toBeNull();
  });

  it('a confirm that fails is logged once and retried by the sweep', async () => {
    const r = await restaurant();
    const orderId = bigId();
    confirmOrder.mockRejectedValue(new Error('99Food fora do ar'));
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce({ sweep: true });
    await processPendingOnce({ sweep: true });
    const ext = await extOf(orderId);
    expect(ext.platformConfirmedAt).toBeNull();
    expect(confirmOrder.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(await prisma.deliveryLog.count({ where: { externalOrderId: ext.id, message: { startsWith: '99Food não recebeu "confirm"' } } })).toBe(1);
    confirmOrder.mockResolvedValue({ requestId: 'r' });
    await processPendingOnce({ sweep: true });
    expect((await extOf(orderId)).platformConfirmedAt).not.toBeNull();
  });

  it('the sweep runs at most every 30 s without sweep', async () => {
    const r = await restaurant();
    const orderId = bigId();
    confirmOrder.mockRejectedValue(new Error('fora'));
    await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processPendingOnce({ sweep: true });
    const n = confirmOrder.mock.calls.length;
    await processPendingOnce();
    expect(confirmOrder.mock.calls.length).toBe(n);
  });

  it('shopStatus updates the integration status; unbind disconnects the store', async () => {
    const r = await restaurant({}, { pausedUntil: new Date(Date.now() + 3600_000) });
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 2 });
    await processPendingOnce();
    let integ = await prisma.deliveryIntegration.findUnique({ where: { id: r.integ.id } });
    expect(integ.syncError).toBe('Loja pausada na 99Food');
    await event('shopStatus', r.appShopId, { biz_status: 1, sub_biz_status: 1 });
    await processPendingOnce();
    integ = await prisma.deliveryIntegration.findUnique({ where: { id: r.integ.id } });
    expect(integ.syncStatus).toBe('SUCCESS');
    expect(integ.syncError).toBeNull();
    // online on the 99Food: the pause made from Gastrux is over
    expect((await prisma.ninetynineStoreState.findUnique({ where: { integrationId: r.integ.id } }))?.pausedUntil).toBeNull();

    await event('shopBindStatus', null, { appShopIDList: [r.appShopId], bindStatus: 'unbind' });
    await processPendingOnce();
    integ = await prisma.deliveryIntegration.findUnique({ where: { id: r.integ.id } });
    expect(integ.storeId).toBeNull();
    expect(integ.isActive).toBe(false);
    expect(await prisma.notification.count({ where: { restaurantId: r.rid, message: 'A loja da 99Food foi desligada do Gastrux' } })).toBe(1);
  });

  it('shopStatus rings the restaurant once when the store goes closed, disconnected or blocked', async () => {
    const r = await restaurant();
    const rung = (word) => prisma.notification.count({ where: { restaurantId: r.rid, message: `A loja da 99Food está ${word} na 99Food — os pedidos não chegam` } });
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 3 });
    await processPendingOnce();
    expect(await rung('fechada')).toBe(1);
    // the same status again: no second ring
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 3 });
    await processPendingOnce();
    expect(await rung('fechada')).toBe(1);
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 4 });
    await processPendingOnce();
    expect(await rung('desconectada')).toBe(1);
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 6 });
    await processPendingOnce();
    expect(await rung('bloqueada')).toBe(1);
    // a pause or "no couriers" is not a ring
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 2 });
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 7 });
    await processPendingOnce();
    expect(await prisma.notification.count({ where: { restaurantId: r.rid } })).toBe(3);
    // back to closed after something else: a new change rings again
    await event('shopStatus', r.appShopId, { biz_status: 2, sub_biz_status: 3 });
    await processPendingOnce();
    expect(await rung('fechada')).toBe(2);
  });

  it('processNinetynineEvent processes one row directly', async () => {
    const r = await restaurant();
    const orderId = bigId();
    const row = await event('orderNew', r.appShopId, { order_id: orderId, order_info: orderInfo(orderId) });
    await processNinetynineEvent(row);
    expect((await extOf(orderId)).status).toBe('CONFIRMED');
    expect((await rowOf(row.id)).processedAt).not.toBeNull();
  });
});
