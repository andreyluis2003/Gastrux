// @ts-nocheck
/**
 * Read isolation sweep (2026-10-06, after /receitas and /estoque were found listing every
 * restaurant's data). Logged in as the OWNER of restaurant A, every GET route of the API is called:
 * - plain routes, also with ?restaurantId=<B> (a route must never trust a restaurant id from the URL);
 * - routes with one path parameter, with each id of B's data as that parameter.
 * Restaurant B is filled with rows whose names carry a unique MARK; if MARK (or one of B's row ids)
 * shows up in any answer, that route leaks another restaurant's data. A route that fails, needs
 * other input or calls an outside service is fine here: only a leak fails the test.
 * Every route's outcome is written to read-isolation-report.json next to this file's run dir.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const MARK = `vazamento${tag}`;
const API_DIR = path.join(__dirname, '../../../app/api');
const PER_CALL_MS = 8000;

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(p);
    return e.name === 'route.ts' ? [p] : [];
  });
}

async function readSome(res: any): Promise<string> {
  if (!res.body || typeof res.body.getReader !== "function") return res.text();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + PER_CALL_MS;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([reader.read(), new Promise<any>((r) => setTimeout(() => r({ timeout: true }), Math.max(1, deadline - Date.now())))]);
    if (chunk.timeout || chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text;
}

function withTimeout<T>(p: Promise<T>): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), PER_CALL_MS))]);
}

describe('read isolation: restaurant A never sees restaurant B through any GET route', () => {
  let A: { id: string; ownerId: string; email: string };
  let B: { id: string; ownerId: string; email: string };
  const bIds: string[] = [];
  const realFetch = global.fetch;

  async function makeRestaurant(letter: string, name: string) {
    const email = `iso-${letter}-${tag}@gastrux.test`;
    const user = await prisma.user.create({ data: { email, name: `Dono ${letter}`, password: 'x', role: 'OWNER', active: true } });
    const r = await prisma.restaurant.create({
      data: { name, status: 'ACTIVE', subscriptionStatus: 'active', subscriptionTier: 'enterprise', ownerId: user.id, address: `Rua ${name}, 1`, city: 'Cidade', state: 'SP' },
    });
    await prisma.user.update({ where: { id: user.id }, data: { currentRestaurantId: r.id } });
    await prisma.restaurantUser.create({ data: { restaurantId: r.id, userId: user.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    return { id: r.id, ownerId: user.id, email };
  }

  beforeAll(async () => {
    A = await makeRestaurant('a', `Restaurante A ${tag}`);
    B = await makeRestaurant('b', `Restaurante B ${MARK}`);
    const rid = B.id;
    const keep = (row: any) => { bIds.push(row.id); return row; };

    const cat = keep(await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Categoria ${MARK}` } }));
    const ing = keep(await prisma.ingredient.create({
      data: { restaurantId: rid, code: `ING-${MARK}`, name: `Insumo ${MARK}`, categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 5, referenceCost: 10 },
    }));
    keep(await prisma.stock.create({ data: { restaurantId: rid, ingredientId: ing.id, currentQuantity: 1 } }));
    keep(await prisma.supplier.create({ data: { restaurantId: rid, code: `SUP-${MARK}`, name: `Fornecedor ${MARK}` } }));
    // Price history and a price alert: /api/cost-analysis/price-alerts listed every restaurant's (2026-10-06)
    keep(await prisma.priceTrend.create({ data: { restaurantId: rid, ingredientId: ing.id, price: 12.34, recordedDate: new Date() } }));
    keep(await prisma.priceAlert.create({ data: { restaurantId: rid, ingredientId: ing.id, maxPrice: 99, alertType: 'ABOVE_MAX' } }));
    const recipe = keep(await prisma.recipe.create({
      data: { restaurantId: rid, code: `REC-${MARK}`, name: `Receita ${MARK}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30,
        ingredients: { create: [{ ingredientId: ing.id, quantity: 0.2, unit: 'kg' }] } },
    }));
    const menuCat = keep(await prisma.menuCategory.create({ data: { restaurantId: rid, name: `Cardapio ${MARK}`, position: 0, active: true } }));
    keep(await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: menuCat.id, name: `Prato ${MARK}`, price: 30, recipeId: recipe.id, position: 0 } }));
    const section = keep(await prisma.tableSection.create({ data: { restaurantId: rid, name: `Salao ${MARK}`, capacity: 10 } }));
    keep(await prisma.table.create({ data: { restaurantId: rid, number: 99, sectionId: section.id, capacity: 4, description: `Mesa ${MARK}`, qrToken: `qr${MARK}` } }));
    keep(await prisma.customer.create({ data: { restaurantId: rid, name: `Cliente ${MARK}`, email: `cliente-${MARK}@gastrux.test` } }));
    keep(await prisma.order.create({ data: { restaurantId: rid, orderNumber: `PED-${MARK}`, customerName: `Cliente ${MARK}` } }).catch(() =>
      prisma.order.create({ data: { restaurantId: rid, orderNumber: `PED-${MARK}` } })));
    keep(await prisma.alert.create({ data: { restaurantId: rid, type: 'LOW_STOCK', title: `Alerta ${MARK}`, message: `Mensagem ${MARK}` } }));
    keep(await prisma.payment.create({ data: { restaurantId: rid, method: 'PIX', amount: 30, description: `Pagamento ${MARK}` } }).catch(() =>
      prisma.payment.create({ data: { restaurantId: rid, method: 'PIX', amount: 30 } })));
    keep(await prisma.wasteLog.create({ data: { restaurantId: rid, ingredientId: ing.id, quantity: 1, unit: 'kg', reason: 'EXPIRED', notes: `Perda ${MARK}` } }).catch(() =>
      prisma.wasteLog.create({ data: { restaurantId: rid, ingredientId: ing.id, quantity: 1, unit: 'kg', reason: 'EXPIRED' } })));

    const session = { user: { id: A.ownerId, email: A.email, name: 'Dono a', role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
    // No outside service is reached from this sweep
    global.fetch = jest.fn().mockRejectedValue(new Error('network disabled in the isolation sweep'));
  }, 120000);

  afterAll(async () => {
    global.fetch = realFetch;
    for (const r of [A, B]) {
      if (!r) continue;
      try { await prisma.restaurant.delete({ where: { id: r.id } }); } catch {}
      try { await prisma.user.delete({ where: { id: r.ownerId } }); } catch {}
    }
  });

  it('no GET route answers with restaurant B\'s data', async () => {
    const report: any[] = [];
    const leaks: string[] = [];
    const leaked = (text: string) => text.includes(MARK) || bIds.some((id) => text.includes(id));
    // Public on purpose (the customer's QR-code menu and the delivery ordering page, any restaurant by id): its dishes may show,
    // but never what is behind them (recipes, ingredients, suppliers, customers, money, alerts)
    const PUBLIC_BY_DESIGN = ['cardapio/publico', 'public/delivery/menu'];
    const PRIVATE_MARKS = ['Insumo', 'Receita', 'Fornecedor', 'Cliente', 'Pagamento', 'Alerta', 'Mensagem', 'Perda', 'Categoria'].map((w) => `${w} ${MARK}`);
    const leakedFromPublic = (text: string) => PRIVATE_MARKS.some((m) => text.includes(m));

    async function call(GET: any, url: string, params: any, label: string) {
      try {
        const res = await withTimeout(Promise.resolve(GET(new NextRequest(url), { params })));
        if (res === 'timeout') return report.push({ label, outcome: 'timeout' });
        if (!res || typeof res.text !== 'function') return report.push({ label, outcome: 'no-response' });
        // A streaming answer (server-sent events) never ends: read what arrives within the time limit
        const text = await readSome(res);
        report.push({ label, status: res.status });
        const isPublic = PUBLIC_BY_DESIGN.some((p) => label.startsWith(`/api/${p}`));
        if (isPublic ? leakedFromPublic(text) : leaked(text)) leaks.push(`${label} -> ${res.status}`);
      } catch (e: any) {
        report.push({ label, outcome: `threw: ${String(e?.message || e).slice(0, 80)}` });
      }
    }

    // ISOLATION_SHARD="2/4" runs the second quarter of the routes only: the whole sweep loads 259
    // compiled routes and ran out of memory on a machine with ~1 GB free (2026-10-06)
    const [shard, shards] = (process.env.ISOLATION_SHARD || '1/1').split('/').map(Number);
    const all = routeFiles(API_DIR).sort();
    const mine = all.filter((_, i) => i % shards === shard - 1);
    const reportFile = path.join(__dirname, `read-isolation-report-${shard}-of-${shards}.json`);

    let current = '';
    const save = () => fs.writeFileSync(reportFile, JSON.stringify({ tag, shard, shards, current, leaks, report }, null, 2));

    for (const file of mine) {
      const rel = path.relative(API_DIR, path.dirname(file)).replace(/\\/g, '/');
      current = `/api/${rel}`;
      // Only routes that answer GET: loading the others is wasted time, and some (Twilio voice
      // webhooks) never finish loading under Jest
      if (!/export\s+(const|async\s+function|function)\s+GET\b/.test(fs.readFileSync(file, 'utf8'))) continue;
      save();
      let mod: any;
      try {
        // A module that hangs while loading (a client connecting at import time) must not stall the sweep
        mod = await withTimeout(import(file));
        if (mod === 'timeout') {
          report.push({ label: `/api/${rel}`, outcome: 'import timeout' });
          continue;
        }
      } catch (e: any) {
        report.push({ label: `/api/${rel}`, outcome: `import failed: ${String(e?.message || e).slice(0, 80)}` });
        continue;
      }
      if (typeof mod.GET !== 'function') continue;

      const dynamic = [...rel.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].replace(/^\.\.\./, ''));
      if (dynamic.length === 0) {
        await call(mod.GET, `http://localhost/api/${rel}`, {}, `/api/${rel}`);
        await call(mod.GET, `http://localhost/api/${rel}?restaurantId=${B.id}&restaurant_id=${B.id}`, {}, `/api/${rel}?restaurantId=B`);
      } else if (dynamic.length === 1) {
        const name = dynamic[0];
        for (const id of [...bIds, B.id, `qr${MARK}`]) {
          const urlPath = rel.replace(/\[[^\]]+\]/, id);
          await call(mod.GET, `http://localhost/api/${urlPath}`, { [name]: id }, `/api/${rel} (${name}=B)`);
        }
      }
    }

    save();
    expect(leaks).toEqual([]);
  }, 1800000);
});
