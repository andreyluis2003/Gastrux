/**
 * Importar o cardápio por link (spec 2026-11-06): read a store page (network replaced), then write the reviewed
 * menu once, with photos, codes, addons and the price change; only the owner or the manager.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET, POST } from '../../../app/api/cardapio/importar/route';
import { pageTransport } from '../../../lib/cardapio/import/fetch-page';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/cardapio/importar', { method: 'POST', body: JSON.stringify(body) }));
const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);

const PAGE = `<script>window.__INITIAL_DATA__ = ${JSON.stringify({
  loja: { nome_fantasia: 'Loja Exemplo' },
  catalogo: { categorias: { '1': { nome: `Burgers ${tag}`, ordem: 0, itens: {
    '11': { id: 11, nome: `Duplo ${tag}`, preco: 30, status: 'disponivel', foto_principal: 'https://cdn.exemplo.com/d.jpg', cod_pdv: `B-${tag}`, ordem: 0,
      categorias_complementos: { g: { nome: `Extras ${tag}`, complementos: { a: { nome: 'Bacon', preco: 4 } } } } },
    '12': { id: 12, nome: `Simples ${tag}`, preco: 20, status: 'disponivel', cod_pdv: `B-${tag}`, ordem: 1 },
  } } } },
})};</script>`;

describe('menu import by link: /api/cardapio/importar', () => {
  let owner, cook, rid;
  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `imp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `imp-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    rid = (await prisma.restaurant.create({ data: { name: `Imp ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  });
  beforeEach(() => {
    jest.spyOn(pageTransport, 'resolve').mockImplementation(async (url: string) => (url.startsWith('https://loja.exemplo.com') ? { address: '203.0.113.7', family: 4 } : null));
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    try { await prisma.itemModifier.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('is for the owner or the manager', async () => {
    as(null);
    expect((await GET()).status).toBe(401);
    as(cook);
    expect((await post({ action: 'ler', url: 'https://loja.exemplo.com/p' })).status).toBe(403);
  });

  it('sends iFood links to the photo import and refuses a page outside the public internet', async () => {
    as(owner);
    const get = jest.spyOn(pageTransport, 'get');
    const r1 = await post({ action: 'ler', url: 'https://www.ifood.com.br/delivery/x/y/z' });
    expect(r1.status).toBe(422);
    expect((await r1.json()).error).toMatch(/iFood/);
    const r2 = await post({ action: 'ler', url: 'https://10.0.0.1/admin' });
    expect(r2.status).toBe(422);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads the page, following one redirect, and writes nothing', async () => {
    as(owner);
    const get = jest.spyOn(pageTransport, 'get')
      .mockResolvedValueOnce({ status: 301, location: '/pedidos', body: '', tooBig: false })
      .mockResolvedValueOnce({ status: 200, location: null, body: PAGE, tooBig: false });
    const res = await post({ action: 'ler', url: 'loja.exemplo.com/loja' });
    expect(res.status).toBe(200);
    const menu = await res.json();
    expect(get.mock.calls.map((c) => c[0].url)).toEqual(['https://loja.exemplo.com/loja', 'https://loja.exemplo.com/pedidos']);
    expect(menu).toMatchObject({ fonte: 'zepediu', loja: 'Loja Exemplo', adicionais: [{ grupo: `Extras ${tag}`, nome: 'Bacon', preco: 4 }] });
    expect(menu.categorias[0].itens).toHaveLength(2);
    expect(await prisma.menuItem.count({ where: { restaurantId: rid } })).toBe(0);
  });

  it('imports with -10%, the photo, the code once, the addon and a ficha simples; a second time skips', async () => {
    as(owner);
    const body = {
      action: 'importar', confirmaDono: true, ajustePct: -10, removeExample: false,
      categorias: [{ nome: `Burgers ${tag}`, itens: [
        { nome: `Duplo ${tag}`, descricao: '', preco: 30, foto: 'https://cdn.exemplo.com/d.jpg', codigo: `B-${tag}` },
        { nome: `Simples ${tag}`, descricao: '', preco: 20, foto: null, codigo: `B-${tag}` },
      ] }],
      adicionais: [{ grupo: `Extras ${tag}`, nome: 'Bacon', preco: 4 }],
    };
    expect((await post({ ...body, confirmaDono: false })).status).toBe(400);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 2, skipped: [], photos: 1, codes: 1, addons: 1 });
    const items = await prisma.menuItem.findMany({ where: { restaurantId: rid }, include: { images: true }, orderBy: { position: 'asc' } });
    expect(items.map((i) => [i.name, Number(i.price), i.code, i.images.map((x) => x.imageUrl), !!i.recipeId])).toEqual([
      [`Duplo ${tag}`, 27, `B-${tag}`, ['https://cdn.exemplo.com/d.jpg'], true],
      [`Simples ${tag}`, 18, null, [], true],
    ]);
    const again = await (await post(body)).json();
    expect(again).toMatchObject({ created: 0, skipped: [`Duplo ${tag}`, `Simples ${tag}`], addons: 0 });
    expect(await prisma.itemModifier.count({ where: { restaurantId: rid } })).toBe(1);
  });
});
