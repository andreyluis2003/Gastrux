// @ts-nocheck
/** AI tools: scoped, role-filtered, read-only, no personal data (spec 2026-10-16 ia-assistente §4.2, §4.3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { runTool } from '../../../lib/ai/tools/run';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const sept = { inicio: '2026-09-01', fim: '2026-09-30' };

describe('AI tools', () => {
  let rid, otherRid, owner, cashier, cook, espeto, userIds = [];
  const m = (u, restaurantId = rid) => ({ userId: u.id, restaurantId, role: u.role });
  beforeAll(async () => {
    const mk = async (role, restaurantId) => {
      const u = await prisma.user.create({ data: { email: `ait-${role}-${crypto.randomBytes(3).toString('hex')}-${tag}@gastrux.test`, name: role, password: 'x', role, currentRestaurantId: restaurantId } });
      if (restaurantId && role !== 'OWNER') await prisma.restaurantUser.create({ data: { restaurantId, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      userIds.push(u.id);
      return { id: u.id, role };
    };
    const o = await mk('OWNER', null);
    rid = (await prisma.restaurant.create({ data: { name: `Ait ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Ait2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    owner = o; cashier = await mk('CASHIER', rid); cook = await mk('COOK', rid);
    const register = await prisma.cashRegister.create({ data: { name: 'Caixa', restaurantId: rid, isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: register.id, openedById: o.id } });
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Carnes' } });
    const frango = await prisma.ingredient.create({ data: { restaurantId: rid, code: `F${tag}`, name: 'Frango', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 20, minimumStock: 5 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: frango.id, currentQuantity: 2 } });
    espeto = await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Espeto de frango', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount: true,
      ingredients: { create: [{ ingredientId: frango.id, quantity: 0.12, unit: 'kg' }] } } });
    const at = new Date('2026-09-10T22:00:00Z');
    const sale = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', closedAt: at, customerName: 'Maria Cliente', items: { create: [{ recipeId: espeto.id, quantity: 3, price: 10, addedAt: at }] } } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, createdById: o.id, type: 'RECEIPT', method: 'CASH', amountCents: 3000, orderSessionId: sale.id, createdAt: at } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'OPEN', tableNumber: 4, customerName: 'João da Silva', items: { create: [{ recipeId: espeto.id, quantity: 2, price: 10 }] } } });
    // Another restaurant's sale must never show up
    const r2 = await prisma.recipe.create({ data: { restaurantId: otherRid, code: `X${tag}`, name: 'Alheio', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 99 } });
    await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: o.id, status: 'OPEN', tableNumber: 9, items: { create: [{ recipeId: r2.id, quantity: 9, price: 99 }] } } });
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('vendas_periodo: Caixa numbers for the manager; refused for cashier and cook', async () => {
    const r = await runTool(m(owner), 'vendas_periodo', sept);
    expect(r).toMatchObject({ ok: true, data: { total: 30, vendas: 1 } });
    for (const u of [cashier, cook]) expect(await runTool(m(u), 'vendas_periodo', sept)).toMatchObject({ ok: false, denied: true });
  });

  it('itens_vendidos: revenue only for managers', async () => {
    const own = await runTool(m(owner), 'itens_vendidos', sept);
    expect(own.data.itens[0]).toMatchObject({ item: 'Espeto de frango', quantidade: 3, receita: 30 });
    const ck = await runTool(m(cook), 'itens_vendidos', sept);
    expect(ck.data.itens[0]).toEqual({ item: 'Espeto de frango', quantidade: 3 });
  });

  it('mesas_agora: never the comanda name; the cook gets no values; other restaurants never', async () => {
    const own = await runTool(m(owner), 'mesas_agora', {});
    expect(JSON.stringify(own)).not.toMatch(/João|Maria|Alheio/);
    expect(own.data.mesas).toEqual([expect.objectContaining({ mesa: 4, valorAberto: 20 })]);
    const ck = await runTool(m(cook), 'mesas_agora', {});
    expect(Object.keys(ck.data.mesas[0]).sort()).toEqual(['abertaHaMinutos', 'mesa']);
  });

  it('contagem_dia never opens a night (read-only)', async () => {
    const before = await prisma.dailyCount.count({ where: { restaurantId: rid } });
    const r = await runTool(m(cook), 'contagem_dia', {});
    expect(r).toMatchObject({ ok: true, data: { noiteAberta: null } });
    expect(await prisma.dailyCount.count({ where: { restaurantId: rid } })).toBe(before);
  });

  it('estoque_baixo and ficha_tecnica (cost only for managers)', async () => {
    expect((await runTool(m(cook), 'estoque_baixo', {})).data.insumos).toEqual([{ insumo: 'Frango', atual: 2, minimo: 5, unidade: 'kg' }]);
    const own = await runTool(m(owner), 'ficha_tecnica', { nome: 'espeto' });
    expect(own.data.itens[0]).toMatchObject({ item: 'Espeto de frango', custo: 2.4, preco: 10, margemPct: 76 });
    const ck = await runTool(m(cook), 'ficha_tecnica', { nome: 'espeto' });
    expect(ck.data.itens[0]).not.toHaveProperty('custo');
    expect(ck.data.itens[0].ingredientes).toEqual([{ insumo: 'Frango', quantidade: 0.12, unidade: 'kg' }]);
  });

  it('plano: plan, used and remaining questions', async () => {
    expect((await runTool(m(cashier), 'plano', {})).data).toMatchObject({ plano: 'pro', limiteMensal: 50, usadas: 0, restantes: 50 });
  });

  it('bad input becomes a tool error, not an exception', async () => {
    expect(await runTool(m(owner), 'vendas_periodo', { inicio: '2026-09-30', fim: '2026-09-01' })).toMatchObject({ ok: false, denied: false });
    expect(await runTool(m(owner), 'nao_existe', {})).toMatchObject({ ok: false, denied: false });
  });
});
