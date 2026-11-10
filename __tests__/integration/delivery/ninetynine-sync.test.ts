// @ts-nocheck
/** What Gastrux does to a 99Food order goes back to 99Food, and the requests get answered (plan 2026-11-09 99food, Task 5) */
jest.mock('../../../lib/ninetynine/client', () => ({
  ...jest.requireActual('../../../lib/ninetynine/client'),
  confirmOrder: jest.fn(),
  orderReady: jest.fn(),
  orderDelivered: jest.fn(),
  cancelOrder: jest.fn(),
  answerCancelApply: jest.fn(),
  answerRefundApply: jest.fn(),
  confirmCashPayment: jest.fn(),
}));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import * as nn from '../../../lib/ninetynine/client';
import { mapNinetynineOrder } from '../../../lib/ninetynine/order-map';
import { ingestDeliveryOrder, rejectDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { answerDispute, cancelPlatformOrder, confirmCash, platformCancelReasons, pushPlatformStatus } from '../../../lib/delivery-orders/platform-sync';
import { changeOrderStatus } from '../../../lib/kds/order-status';
import { DELETE as KDS_CANCEL } from '../../../app/api/kds/orders/[id]/route';
import { POST as CASH } from '../../../app/api/admin/integrations/orders/[id]/cash/route';
import { PUT as MOVE } from '../../../app/api/admin/integrations/orders/[id]/route';
import { GET as REASONS } from '../../../app/api/admin/integrations/orders/[id]/cancel-reasons/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const bigId = () => `57646${String(Date.now()).slice(-8)}${String(100000 + seq++).slice(-6)}`;
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const FNS = ['confirmOrder', 'orderReady', 'orderDelivered', 'cancelOrder', 'answerCancelApply', 'answerRefundApply', 'confirmCashPayment'];

function orderInfo(orderId: string, extra = {}) {
  return {
    order_id: orderId, order_index: 42, status: 100, delivery_type: 1, fulfillment_mode: 0,
    pay_type: 1, pay_method: 1, pay_channel: 212,
    price: { order_price: 6000, delivery_price: 900, others_fees: {} },
    receive_address: { name: 'Maria', first_name: 'Maria', virtual_phone_number: '00016004812', locator: '4321', street_name: 'Rua A' },
    order_items: [{ name: 'Pizza', amount: 2, sku_price: 3000, total_price: 6000, app_item_id: 'PZ1' }],
    ...extra,
  };
}

describe('99Food platform sync', () => {
  const made = [];

  async function restaurant(autoAccept = true) {
    const owner = await prisma.user.create({ data: { email: `nns-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    const r = await prisma.restaurant.create({ data: { name: `Nns ${seq++} ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false, deliveryAutoAccept: autoAccept } });
    await prisma.user.update({ where: { id: owner.id }, data: { currentRestaurantId: r.id } });
    const integ = await prisma.deliveryIntegration.create({ data: { restaurantId: r.id, platform: 'ninety_nine_food', apiKey: 'x', webhookSecret: 'y', storeId: bigId() } });
    await prisma.recipe.create({ data: { restaurantId: r.id, code: `R${tag}${seq++}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    made.push({ rid: r.id, ownerId: owner.id });
    return { rid: r.id, integ, owner: { id: owner.id, email: owner.email, role: 'OWNER' }, member: { restaurantId: r.id, userId: owner.id, role: 'OWNER' } };
  }
  async function ingest(r, extra = {}) {
    const orderId = bigId();
    const m = mapNinetynineOrder(orderInfo(orderId, extra));
    const res = await ingestDeliveryOrder({ restaurantId: r.rid, integrationId: r.integ.id, platform: 'ninety_nine_food', input: m.input, extraNote: m.extraNote, platformData: m.platformData });
    return { ...res, orderId, id: res.externalOrder.id };
  }
  const called = () => FNS.filter((f) => nn[f].mock.calls.length > 0);

  beforeEach(() => {
    for (const f of FNS) { nn[f].mockReset(); nn[f].mockResolvedValue({ requestId: 'req' }); }
  });
  afterAll(async () => {
    for (const m of made) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.order.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: m.rid } }); } catch {}
      try { await prisma.user.delete({ where: { id: m.ownerId } }); } catch {}
    }
  });

  it('auto-accept confirms on 99Food once and records it', async () => {
    const r = await restaurant();
    const o = await ingest(r);
    expect(nn.confirmOrder).toHaveBeenCalledTimes(1);
    expect(nn.confirmOrder).toHaveBeenCalledWith(r.integ.id, o.orderId);
    expect((await prisma.externalOrder.findUnique({ where: { id: o.id } })).platformConfirmedAt).not.toBeNull();
    // the 99Food requestId stays on the order's log, for 99Food support
    expect(await prisma.deliveryLog.count({ where: { externalOrderId: o.id, message: '99Food recebeu "confirm" · requestId=req' } })).toBe(1);
  });

  it('a failed confirm is logged only once across retries', async () => {
    const r = await restaurant();
    nn.confirmOrder.mockRejectedValue(new Error('down'));
    const o = await ingest(r);
    expect(await pushPlatformStatus(o.id, 'confirm')).toBe(false);
    const ext = await prisma.externalOrder.findUnique({ where: { id: o.id }, include: { deliveryLogs: true } });
    expect(ext.platformConfirmedAt).toBeNull();
    expect(ext.deliveryLogs.filter((l) => l.message.startsWith('99Food não recebeu "confirm"'))).toHaveLength(1);
  });

  it('kitchen steps: ready always, delivered only on store delivery, preparing never', async () => {
    const r = await restaurant();
    const by99 = await ingest(r, { delivery_type: 1 });
    const own = await ingest(r, { delivery_type: 2 });
    for (const f of FNS) nn[f].mockClear();
    for (const o of [by99, own]) for (const s of ['PREPARING', 'READY', 'COMPLETED']) await changeOrderStatus(r.rid, o.kitchenOrderId, s);
    expect(nn.orderReady.mock.calls).toEqual([[r.integ.id, by99.orderId], [r.integ.id, own.orderId]]);
    expect(nn.orderDelivered.mock.calls).toEqual([[r.integ.id, own.orderId]]);
    expect(called().sort()).toEqual(['orderDelivered', 'orderReady']);
  });

  it('cancel reasons: the fixed list, own-delivery reasons only on store delivery', async () => {
    const r = await restaurant();
    const by99 = await ingest(r, { delivery_type: 1 });
    const own = await ingest(r, { delivery_type: 2 });
    const ids = async (o) => (await platformCancelReasons(r.member, o.id)).map((x) => x.cancelCodeId);
    expect(await ids(by99)).toEqual(['1010', '1020', '1030', '1040', '1050', '1070', '1073', '1074', '1080']);
    expect(await ids(own)).toEqual(['1010', '1020', '1030', '1040', '1050', '1060', '1070', '1071', '1072', '1073', '1074', '1080']);
    expect((await platformCancelReasons(r.member, own.id))[0]).toEqual({ cancelCodeId: '1010', description: 'Item esgotado' });
    as(r.owner);
    const res = await REASONS(new NextRequest('http://x'), { params: { id: by99.id } });
    expect(res.status).toBe(200);
    expect((await res.json()).reasons).toHaveLength(9);
  });

  it('cancelPlatformOrder: needs a 99Food reason, 1080 needs text, sends the reason id', async () => {
    const r = await restaurant();
    const o = await ingest(r);
    await expect(cancelPlatformOrder(r.member, o.id, { code: '', reason: '' })).rejects.toMatchObject({ status: 400, message: 'Escolha o motivo da 99Food' });
    await expect(cancelPlatformOrder(r.member, o.id, { code: '1080', reason: ' ' })).rejects.toMatchObject({ status: 400, message: 'Escreva o motivo' });
    await expect(cancelPlatformOrder(r.member, o.id, { code: '1060', reason: '' })).rejects.toMatchObject({ status: 400, message: 'Escolha o motivo da 99Food' });
    await expect(cancelPlatformOrder(r.member, o.id, { code: '999', reason: '' })).rejects.toMatchObject({ status: 400 });
    expect(nn.cancelOrder).not.toHaveBeenCalled();
    await cancelPlatformOrder(r.member, o.id, { code: '1080', reason: 'Forno quebrou' });
    expect(nn.cancelOrder).toHaveBeenCalledWith(r.integ.id, o.orderId, 1080, 'Forno quebrou');
    nn.cancelOrder.mockRejectedValue(new Error('down'));
    await expect(cancelPlatformOrder(r.member, o.id, { code: '1010', reason: '' })).rejects.toMatchObject({ status: 502, message: 'A 99Food não recebeu o cancelamento: tente de novo' });
  });

  it('rejecting a new 99Food order cancels it on 99Food with the reason id', async () => {
    const r = await restaurant(false);
    const o = await ingest(r);
    expect(nn.confirmOrder).not.toHaveBeenCalled();
    await expect(rejectDeliveryOrder(r.member, o.id, 'Sem pizza')).rejects.toMatchObject({ status: 400, message: 'Escolha o motivo da 99Food' });
    await rejectDeliveryOrder(r.member, o.id, 'Loja fechada por hoje', '1020');
    expect(nn.cancelOrder).toHaveBeenCalledWith(r.integ.id, o.orderId, 1020, 'Loja fechada por hoje');
    expect((await prisma.externalOrder.findUnique({ where: { id: o.id } })).status).toBe('CANCELLED');
  });

  it('the kitchen cannot cancel a 99Food order directly', async () => {
    const r = await restaurant();
    const o = await ingest(r);
    as(r.owner);
    const out = await KDS_CANCEL(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: o.kitchenOrderId } });
    expect(out.status).toBe(409);
    expect((await out.json()).error).toMatch(/Pedidos de delivery.*99Food/);
  });

  const move = (id, status) => MOVE(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status }) }), { params: { id } });

  it('manual steps: "delivered" goes on Entregue (not Em Entrega), once, only on store delivery', async () => {
    const r = await restaurant();
    const own = await ingest(r, { delivery_type: 2 });
    const by99 = await ingest(r, { delivery_type: 1 });
    as(r.owner);
    for (const o of [own, by99]) {
      expect((await move(o.id, 'READY')).status).toBe(200);
      expect((await move(o.id, 'PICKED_UP')).status).toBe(200);
    }
    expect(nn.orderDelivered).not.toHaveBeenCalled();
    for (const o of [own, by99]) expect((await move(o.id, 'DELIVERED')).status).toBe(200);
    expect(nn.orderDelivered.mock.calls).toEqual([[r.integ.id, own.orderId]]);
    expect(await pushPlatformStatus(own.id, 'dispatch')).toBe(true);
    expect(nn.orderDelivered).toHaveBeenCalledTimes(1);
    expect((await prisma.externalOrder.findUnique({ where: { id: own.id } })).platformData.deliveredSentAt).toBeTruthy();
  });

  it('a jump from Pronto to Entregue sends "delivered" on store delivery', async () => {
    const r = await restaurant();
    const own = await ingest(r, { delivery_type: 2 });
    as(r.owner);
    await move(own.id, 'READY');
    expect((await move(own.id, 'DELIVERED')).status).toBe(200);
    expect(nn.orderDelivered.mock.calls).toEqual([[r.integ.id, own.orderId]]);
  });

  it('a jump past Pronto (to Em Entrega or Entregue) says "ready" once; an order already Pronto does not say it again', async () => {
    const r = await restaurant();
    const jump = await ingest(r, { delivery_type: 2 });
    const direct = await ingest(r, { delivery_type: 1 });
    const viaReady = await ingest(r, { delivery_type: 2 });
    as(r.owner);
    expect((await prisma.externalOrder.findUnique({ where: { id: jump.id } })).status).toBe('CONFIRMED');
    expect((await move(jump.id, 'PICKED_UP')).status).toBe(200);
    expect(nn.orderReady.mock.calls).toEqual([[r.integ.id, jump.orderId]]);
    expect((await move(jump.id, 'DELIVERED')).status).toBe(200);
    expect(nn.orderReady).toHaveBeenCalledTimes(1);
    expect((await move(direct.id, 'DELIVERED')).status).toBe(200);
    expect(nn.orderReady.mock.calls.at(-1)).toEqual([r.integ.id, direct.orderId]);
    expect(nn.orderReady).toHaveBeenCalledTimes(2);
    await move(viaReady.id, 'READY');
    expect(nn.orderReady).toHaveBeenCalledTimes(3);
    expect((await move(viaReady.id, 'PICKED_UP')).status).toBe(200);
    expect((await move(viaReady.id, 'DELIVERED')).status).toBe(200);
    expect(nn.orderReady).toHaveBeenCalledTimes(3);
  });

  async function dispute(o, kind, reasons = []) {
    const applyId = bigId();
    const ext = await prisma.externalOrder.findUnique({ where: { id: o.id } });
    await prisma.externalOrder.update({
      where: { id: o.id },
      data: { disputeId: applyId, disputeExpiresAt: new Date(Date.now() + 300e3), platformData: { ...ext.platformData, disputeKind: kind, disputeReasons: reasons } },
    });
    return applyId;
  }

  it('cancel request: accept and reject go to answerCancelApply', async () => {
    const r = await restaurant();
    const o = await ingest(r);
    let applyId = await dispute(o, 'cancel');
    await answerDispute(r.member, o.id, 'accept');
    expect(nn.answerCancelApply).toHaveBeenLastCalledWith(r.integ.id, o.orderId, applyId, true);
    expect((await prisma.externalOrder.findUnique({ where: { id: o.id } })).disputeId).toBeNull();
    applyId = await dispute(o, 'cancel');
    await answerDispute(r.member, o.id, 'reject');
    expect(nn.answerCancelApply).toHaveBeenLastCalledWith(r.integ.id, o.orderId, applyId, false);
    expect(nn.answerRefundApply).not.toHaveBeenCalled();
  });

  it('a 99Food request past its deadline cannot be answered', async () => {
    const r = await restaurant();
    const o = await ingest(r);
    await dispute(o, 'cancel');
    await prisma.externalOrder.update({ where: { id: o.id }, data: { disputeExpiresAt: new Date(Date.now() - 1000) } });
    await expect(answerDispute(r.member, o.id, 'accept')).rejects.toMatchObject({ status: 409, message: 'O prazo para responder acabou: a 99Food já decidiu este pedido' });
    expect(nn.answerCancelApply).not.toHaveBeenCalled();
  });

  it('refund request: refusing needs one of the stored base reasons', async () => {
    const r = await restaurant();
    const o = await ingest(r);
    const base = [{ base_reason_id: '11', base_reason: 'Item entregue' }, { base_reason_id: 12, base_reason: 'Pedido completo' }];
    const applyId = await dispute(o, 'refund', base);
    await expect(answerDispute(r.member, o.id, 'reject')).rejects.toMatchObject({ status: 400, message: 'Escolha o motivo da recusa' });
    await expect(answerDispute(r.member, o.id, 'reject', { baseReasonId: '99' })).rejects.toMatchObject({ status: 400, message: 'Escolha o motivo da recusa' });
    expect(nn.answerRefundApply).not.toHaveBeenCalled();
    await answerDispute(r.member, o.id, 'reject', { baseReasonId: '12' });
    expect(nn.answerRefundApply).toHaveBeenCalledWith(r.integ.id, o.orderId, applyId, false, { baseReasonId: '12', baseReason: 'Pedido completo' });
    const again = await dispute(o, 'refund', base);
    await answerDispute(r.member, o.id, 'accept');
    expect(nn.answerRefundApply).toHaveBeenLastCalledWith(r.integ.id, o.orderId, again, true, undefined);
  });

  it('"Recebi o dinheiro": only 99Food delivery, cash, accepted', async () => {
    const r = await restaurant();
    const cash = await ingest(r, { delivery_type: 1, pay_type: 2, pay_method: 2, price: { order_price: 6000, delivery_price: 900, shop_paid_money: 6000 } });
    const ownCash = await ingest(r, { delivery_type: 2, pay_type: 2, pay_method: 2 });
    const card = await ingest(r);
    for (const o of [ownCash, card]) await expect(confirmCash(r.member, o.id)).rejects.toMatchObject({ status: 400 });
    expect(nn.confirmCashPayment).not.toHaveBeenCalled();
    as(r.owner);
    const res = await CASH(new NextRequest('http://x', { method: 'POST' }), { params: { id: cash.id } });
    expect(res.status).toBe(200);
    expect(nn.confirmCashPayment).toHaveBeenCalledWith(r.integ.id, cash.orderId);
    expect((await prisma.externalOrder.findUnique({ where: { id: cash.id } })).platformData.cashConfirmedAt).toBeTruthy();
    expect(await prisma.deliveryLog.count({ where: { externalOrderId: cash.id, message: 'Dinheiro confirmado na 99Food · requestId=req' } })).toBe(1);
    await expect(confirmCash(r.member, cash.id)).rejects.toMatchObject({ status: 409 });

    const pending = await ingest(await restaurant(false), { delivery_type: 1, pay_type: 2, pay_method: 2 });
    const pr = made[made.length - 1];
    await expect(confirmCash({ restaurantId: pr.rid, userId: pr.ownerId, role: 'OWNER' }, pending.id)).rejects.toMatchObject({ status: 409 });
  });
});
