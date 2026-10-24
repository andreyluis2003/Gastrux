// @ts-nocheck
/** The public routes of the Gastrux order API (plan 2026-10-23 api-de-pedidos, Task 5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { POST as CREATE } from '../../../app/api/v1/pedidos/route';
import { GET as STATUS } from '../../../app/api/v1/pedidos/[codigo]/route';
import { EXAMPLE_ORDER } from '../../../lib/delivery-orders/example';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');

describe('/api/v1/pedidos', () => {
  const made = [];
  async function restaurant(tier, extra = {}) {
    const owner = await prisma.user.create({ data: { email: `oar-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    const r = await prisma.restaurant.create({ data: { name: `Oar ${seq++} ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active', isInternal: false, ...extra } });
    const integration = await prisma.deliveryIntegration.create({ data: { restaurantId: r.id, platform: 'gastrux_api', apiKey: 'x', webhookSecret: 'y' } });
    const key = `gx_live_${crypto.randomBytes(16).toString('hex').slice(0, 32).replace(/[^A-Za-z0-9]/g, 'a')}`;
    const row = await prisma.orderApiKey.create({ data: { restaurantId: r.id, integrationId: integration.id, name: 'Teste', prefix: key.slice(0, 12) + seq++, keyHash: hash(key), callbackSecret: 'c', createdById: owner.id } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: r.id, code: `R${tag}${seq++}`, name: 'Refrigerante lata', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } });
    made.push({ rid: r.id, ownerId: owner.id });
    return { rid: r.id, key, keyId: row.id, recipe };
  }
  const post = (key, body, extraHeaders = {}) => CREATE(new NextRequest('http://x/api/v1/pedidos', { method: 'POST', headers: { authorization: key ? `Bearer ${key}` : '', 'content-type': 'application/json', ...extraHeaders }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const get = (key, codigo) => STATUS(new NextRequest(`http://x/api/v1/pedidos/${codigo}`, { headers: { authorization: `Bearer ${key}` } }), { params: { codigo } });
  const order = (codigo) => ({ ...JSON.parse(JSON.stringify(EXAMPLE_ORDER)), codigo });

  afterAll(async () => {
    for (const m of made) {
      try { await prisma.order.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: m.rid } }); } catch {}
      try { await prisma.user.delete({ where: { id: m.ownerId } }); } catch {}
    }
  });

  it('creates (201), repeats (200 with the same id) and answers the status in Portuguese', async () => {
    const a = await restaurant('pro');
    const first = await post(a.key, order(`P1-${tag}`));
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body).toMatchObject({ codigo: `P1-${tag}`, status: 'aceito', aceito: true });
    const again = await post(a.key, order(`P1-${tag}`));
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(body.id);
    const st = await get(a.key, `P1-${tag}`);
    expect(st.status).toBe(200);
    expect(await st.json()).toMatchObject({ codigo: `P1-${tag}`, status: 'aceito' });
  });

  it('one restaurant\'s key never reads another\'s order; a revoked key is refused', async () => {
    const a = await restaurant('business');
    const b = await restaurant('business');
    await post(a.key, order(`P2-${tag}`));
    expect((await get(b.key, `P2-${tag}`)).status).toBe(404);
    await prisma.orderApiKey.update({ where: { id: a.keyId }, data: { revokedAt: new Date() } });
    const refused = await post(a.key, order(`P3-${tag}`));
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ erro: 'Chave de API inválida' });
    expect((await post(null, order(`P4-${tag}`))).status).toBe(401);
  });

  it('no plan with the API: 403 with the upgrade; a locked plan: the order refusal', async () => {
    const s = await restaurant('starter');
    const r = await post(s.key, order(`P5-${tag}`));
    expect(r.status).toBe(403);
    expect((await r.json()).upgradeUrl).toBe('/pricing');
    const locked = await restaurant('pro', { subscriptionStatus: 'canceled', status: 'SUSPENDED' });
    expect((await post(locked.key, order(`P6-${tag}`))).status).toBe(403);
    expect(await prisma.externalOrder.count({ where: { restaurantId: { in: [s.rid, locked.rid] } } })).toBe(0);
  });

  it('a wrong body names the field; a body over 256 KB is refused', async () => {
    const a = await restaurant('pro');
    const bad = order(`P7-${tag}`); bad.itens[0].quantidade = 0;
    const r = await post(a.key, bad);
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toMatch(/^itens\[1\]\.quantidade:/);
    expect((await post(a.key, '{ not json')).status).toBe(400);
    const huge = order(`P8-${tag}`); huge.observacao = 'x'.repeat(300 * 1024);
    expect((await post(a.key, huge)).status).toBe(413);
  });
});
