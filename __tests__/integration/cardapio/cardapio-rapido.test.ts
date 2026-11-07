/**
 * Cardápio rápido (spec 2026-11-06): several items at once (sold out, price, %, category, QR/site, weekdays),
 * the weekdays hiding an item from the customer channels, and the WhatsApp bot showing only its restaurant.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const lists: any[] = [];
const texts: string[] = [];
jest.mock('../../../lib/whatsapp/meta-client', () => ({
  normalizePhone: (raw: string) => String(raw).replace(/\D/g, ''),
  MetaCloudClient: jest.fn().mockImplementation(() => ({
    sendText: jest.fn(async ({ text }) => { texts.push(text); return {}; }),
    sendButtons: jest.fn(async ({ body }) => { texts.push(body); return {}; }),
    sendList: jest.fn(async (l) => { lists.push(l); return {}; }),
  })),
}));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST } from '../../../app/api/cardapio/itens/lote/route';
import { GET as qrMenu } from '../../../app/api/public/menu/[qrToken]/route';
import { handleInboundMessage } from '../../../lib/whatsapp/bot';
import { weekdayIn } from '../../../lib/cardapio/days';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/cardapio/itens/lote', { method: 'POST', body: JSON.stringify(body) }));
const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);

describe('cardápio rápido', () => {
  let owner, cook, rid, other, cat, cat2, a, b, c, foreign, qrToken;
  const today = weekdayIn('America/Sao_Paulo');
  const notToday = (today + 3) % 7;
  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `cr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `cr-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    rid = (await prisma.restaurant.create({ data: { name: `CR ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    other = (await prisma.restaurant.create({ data: { name: `CRO ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `Lanches ${tag}`, position: 0, active: true } });
    cat2 = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `Bebidas ${tag}`, position: 1, active: true } });
    a = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'X-Burger', price: 30, position: 0 } });
    b = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'X-Salada', price: 25.5, position: 1 } });
    c = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Feijoada', price: 40, position: 2 } });
    const oc = await prisma.menuCategory.create({ data: { restaurantId: other, name: `Alheia ${tag}`, position: 0, active: true } });
    foreign = await prisma.menuItem.create({ data: { restaurantId: other, categoryId: oc.id, name: 'Alheio', price: 9, position: 0 } });
    const section = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 4 } });
    qrToken = crypto.randomBytes(16).toString('hex');
    await prisma.table.create({ data: { restaurantId: rid, sectionId: section.id, number: 1, capacity: 4, qrToken } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    for (const id of [rid, other]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('is for the owner or the manager, on items of this restaurant only', async () => {
    as(cook);
    expect((await post({ ids: [a.id], acao: 'esgotar' })).status).toBe(403);
    as(owner);
    expect((await post({ ids: [a.id, foreign.id], acao: 'esgotar' })).status).toBe(404);
    expect(await prisma.menuItem.findUnique({ where: { id: a.id } })).toMatchObject({ available: true });
    expect((await post({ ids: [a.id], acao: 'categoria', categoryId: (await prisma.menuCategory.findFirst({ where: { restaurantId: other } })).id })).status).toBe(404);
    expect((await post({ ids: [], acao: 'esgotar' })).status).toBe(400);
  });

  it('sells out and puts back several items at once', async () => {
    as(owner);
    expect((await post({ ids: [a.id, b.id], acao: 'esgotar' })).status).toBe(200);
    expect((await prisma.menuItem.findMany({ where: { id: { in: [a.id, b.id] } } })).every((i) => !i.available)).toBe(true);
    await post({ ids: [a.id, b.id], acao: 'voltar' });
    expect((await prisma.menuItem.findMany({ where: { id: { in: [a.id, b.id] } } })).every((i) => i.available)).toBe(true);
  });

  it('saves a price from the list, refuses a bad one, and changes prices by percent', async () => {
    as(owner);
    expect((await post({ ids: [a.id], acao: 'preco', preco: 'abc' })).status).toBe(400);
    expect((await post({ ids: [a.id, b.id], acao: 'preco', preco: 10 })).status).toBe(400);
    expect((await post({ ids: [a.id], acao: 'preco', preco: '32,50' })).status).toBe(200);
    expect((await post({ ids: [a.id, b.id], acao: 'ajuste', pct: 80 })).status).toBe(400);
    expect((await post({ ids: [a.id, b.id], acao: 'ajuste', pct: 10 })).status).toBe(200);
    const [x, y] = await Promise.all([a.id, b.id].map((id) => prisma.menuItem.findUnique({ where: { id } })));
    expect([Number(x.price), Number(y.price)]).toEqual([35.75, 28.05]);
  });

  it('moves items to another category and hides them from QR and site', async () => {
    as(owner);
    await post({ ids: [b.id], acao: 'categoria', categoryId: cat2.id });
    await post({ ids: [b.id], acao: 'canais', mostrar: false });
    expect(await prisma.menuItem.findUnique({ where: { id: b.id } })).toMatchObject({ categoryId: cat2.id, displayOnQR: false, displayOnWeb: false });
    await post({ ids: [b.id], acao: 'canais', mostrar: true });
  });

  it('an item out of its weekdays leaves the QR menu; every day comes back', async () => {
    as(owner);
    expect((await post({ ids: [c.id], acao: 'dias', dias: [] })).status).toBe(400);
    await post({ ids: [c.id], acao: 'dias', dias: [notToday] });
    const names = async () => (await (await qrMenu(new NextRequest(`http://localhost/api/public/menu/${qrToken}`), { params: { qrToken } })).json())
      .categories.flatMap((k) => k.items.map((i) => i.name));
    expect(await names()).not.toContain('Feijoada');
    await post({ ids: [c.id], acao: 'dias', dias: [today, notToday] });
    expect(await names()).toContain('Feijoada');
    await post({ ids: [c.id], acao: 'dias', dias: [0, 1, 2, 3, 4, 5, 6] });
    expect((await prisma.menuItem.findUnique({ where: { id: c.id } })).availableDays).toEqual([]);
  });

  it('the WhatsApp menu lists only this restaurant, offered today', async () => {
    await prisma.menuItem.update({ where: { id: c.id }, data: { availableDays: [notToday] } });
    await prisma.whatsAppConfig.create({ data: { restaurantId: rid, phoneNumberId: `pn${tag}`, accessToken: 'tk', isActive: true } });
    const phone = `5566${Date.now()}`.slice(0, 13);
    await handleInboundMessage(rid, { from: phone, buttonId: 'BTN_VIEW_MENU', waMessageId: `w1-${tag}` });
    const rows = lists.at(-1).sections[0].rows.map((r) => r.title);
    expect(rows.some((t) => t.includes(`Alheia ${tag}`))).toBe(false);
    expect(rows.some((t) => t.includes(`Lanches ${tag}`))).toBe(true);
    // Another restaurant's item cannot be added by id
    await handleInboundMessage(rid, { from: phone, listId: `ITEM_${foreign.id}`, waMessageId: `w2-${tag}` });
    expect(texts.at(-1)).toMatch(/Item não encontrado/);
    // Nor today's off-day item
    await handleInboundMessage(rid, { from: phone, listId: `ITEM_${c.id}`, waMessageId: `w3-${tag}` });
    expect(texts.at(-1)).toMatch(/Item não encontrado/);
  });
});
