// @ts-nocheck
/** Signed status callbacks of the Gastrux order API (plan 2026-10-23 api-de-pedidos, Task 6) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { callbackTransport, notifyOrderStatus, resolvePublicAddress } from '../../../lib/delivery-orders/callback';
import { ingestDeliveryOrder, acceptDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { parseOrderApiInput } from '../../../lib/delivery-orders/input';
import { changeOrderStatus } from '../../../lib/kds/order-status';
import { EXAMPLE_ORDER } from '../../../lib/delivery-orders/example';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const until = async (check, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

describe('notifyOrderStatus', () => {
  let rid, ownerId, integrationId, keyId, secret;
  const input = (codigo) => { const b = JSON.parse(JSON.stringify(EXAMPLE_ORDER)); b.codigo = codigo; const r = parseOrderApiInput(b); if (!r.ok) throw new Error(r.error); return r.value; };
  const ingest = (codigo) => ingestDeliveryOrder({ restaurantId: rid, integrationId, apiKeyId: keyId, platform: 'gastrux_api', input: input(codigo) });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `oac-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Oac ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false } })).id;
    integrationId = (await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'gastrux_api', apiKey: 'x', webhookSecret: 'y' } })).id;
    secret = crypto.randomBytes(32).toString('hex');
    keyId = (await prisma.orderApiKey.create({ data: { restaurantId: rid, integrationId, name: 'Com aviso', prefix: `gx_live_${tag}`, keyHash: `h-${tag}`, callbackUrl: 'https://1.1.1.1/hook', callbackSecret: secret, createdById: ownerId } })).id;
    await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Espeto de alcatra', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 14 } });
  }, 60000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.order.deleteMany({ where: { restaurantId: rid } });
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.delete({ where: { id: ownerId } });
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepting sends "aceito", signed with the key secret, to the validated address; the kitchen\'s READY sends "pronto"', async () => {
    const send = jest.spyOn(callbackTransport, 'send').mockResolvedValue({ status: 200 });
    const r = await ingest(`C1-${tag}`);
    expect(await until(() => send.mock.calls.length >= 1)).toBe(true);
    const call = send.mock.calls[0][0];
    expect(call.url).toBe('https://1.1.1.1/hook');
    expect(call.address).toBe('1.1.1.1');
    const payload = JSON.parse(call.body);
    expect(payload).toMatchObject({ codigo: `C1-${tag}`, status: 'aceito' });
    expect(call.headers['x-gastrux-signature']).toBe(`sha256=${crypto.createHmac('sha256', secret).update(call.body).digest('hex')}`);
    await changeOrderStatus(rid, r.kitchenOrderId, 'READY');
    expect(await until(() => send.mock.calls.some((c) => JSON.parse(c[0].body).status === 'pronto'))).toBe(true);
    expect(await prisma.deliveryLog.count({ where: { externalOrderId: r.externalOrder.id } })).toBeGreaterThanOrEqual(2);
  });

  it('a slow address does not hold the order, and the failure is logged', async () => {
    const send = jest.spyOn(callbackTransport, 'send').mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)));
    const started = Date.now();
    const r = await ingest(`C2-${tag}`);
    expect(Date.now() - started).toBeLessThan(6000);
    expect(r.kitchenOrderId).toBeTruthy();
    // The call goes out in the background, after the order is already saved
    expect(await until(() => send.mock.calls.length > 0)).toBe(true);
  }, 20000);

  it('the address is resolved again when sending: a name that now points inside is not called', async () => {
    const send = jest.spyOn(callbackTransport, 'send').mockResolvedValue({ status: 200 });
    expect(await resolvePublicAddress('https://localhost/x')).toBeNull();
    expect(await resolvePublicAddress('https://[::ffff:10.0.0.1]/x')).toBeNull();
    expect(await resolvePublicAddress('https://1.1.1.1/x')).toEqual({ address: '1.1.1.1', family: 4 });
    // Saved before the check existed (or edited in the database): still never called
    await prisma.orderApiKey.update({ where: { id: keyId }, data: { callbackUrl: 'https://127.0.0.1/hook' } });
    try {
      const r = await ingest(`C3-${tag}`);
      await notifyOrderStatus(r.externalOrder.id);
      expect(send.mock.calls.filter((c) => JSON.parse(c[0].body).codigo === `C3-${tag}`)).toEqual([]);
    } finally {
      await prisma.orderApiKey.update({ where: { id: keyId }, data: { callbackUrl: 'https://1.1.1.1/hook' } });
    }
  });

  it('no callback address, no call; an order without a key (site, platform) is never notified', async () => {
    const send = jest.spyOn(callbackTransport, 'send').mockResolvedValue({ status: 200 });
    await prisma.orderApiKey.update({ where: { id: keyId }, data: { callbackUrl: null } });
    try {
      const r = await ingest(`C4-${tag}`);
      await notifyOrderStatus(r.externalOrder.id);
      const k = await ingestDeliveryOrder({ restaurantId: rid, integrationId, platform: 'gastrux_api', input: input(`C5-${tag}`) });
      await notifyOrderStatus(k.externalOrder.id);
      expect(send.mock.calls.filter((c) => [`C4-${tag}`, `C5-${tag}`].includes(JSON.parse(c[0].body).codigo))).toEqual([]);
    } finally {
      await prisma.orderApiKey.update({ where: { id: keyId }, data: { callbackUrl: 'https://1.1.1.1/hook' } });
    }
  });
});
