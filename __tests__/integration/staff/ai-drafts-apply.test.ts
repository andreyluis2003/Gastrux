// @ts-nocheck
/** Review and confirm AI drafts with the screens' own code (spec 2026-10-17 ia-implantacao §4.4-§4.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as GET_DRAFT } from '../../../app/api/ai/drafts/[id]/route';
import { POST as APPLY } from '../../../app/api/ai/drafts/[id]/apply/route';
import { POST as DISCARD } from '../../../app/api/ai/drafts/[id]/discard/route';
import { createDraft } from '../../../lib/ai/drafts/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => { const s = { user: u, expires: '2099-01-01' }; getServerSession.mockResolvedValue(s); getServerSessionNext.mockResolvedValue(s); };
const req = (body?) => new Request('http://x', { method: 'POST', body: body ? JSON.stringify(body) : undefined });

describe('apply AI drafts', () => {
  let rid, ridB, owner, manager, cook, ownerB, ownerM, userIds = [], createdUserIds = [];
  const mkUser = async (label, role, restaurantId) => {
    const u = await prisma.user.create({ data: { email: `ada-${label}-${tag}@gastrux.test`, name: label, password: 'x', role, currentRestaurantId: restaurantId } });
    userIds.push(u.id);
    return u;
  };
  beforeAll(async () => {
    const o = await mkUser('dona', 'OWNER', null);
    rid = (await prisma.restaurant.create({ data: { name: `Ada ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'business' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    ownerM = { userId: o.id, restaurantId: rid, role: 'OWNER' };
    const m = await mkUser('gerente', 'MANAGER', rid);
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: m.id, role: 'MANAGER', permissions: [], acceptedAt: new Date() } });
    manager = { id: m.id, email: m.email, role: 'MANAGER' };
    const c = await mkUser('cozinha', 'COOK', rid);
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    const ob = await mkUser('donab', 'OWNER', null);
    ridB = (await prisma.restaurant.create({ data: { name: `AdaB ${tag}`, ownerId: ob.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ob.id }, data: { currentRestaurantId: ridB } });
    ownerB = { id: ob.id, email: ob.email, role: 'OWNER' };
  });
  afterAll(async () => {
    try { await prisma.staffMember.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, ridB] } } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { userId: { in: [...userIds, ...createdUserIds] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [...userIds, ...createdUserIds] } } }); } catch {}
  });

  it('menu: creates items with a ficha simples, skips duplicates, removes the example when asked', async () => {
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca-Cola', price: 6, position: 0, createdAt: new Date(Date.now() + 3600000) } });
    const demo = await prisma.recipe.create({ data: { restaurantId: rid, code: `DEMO-R-${tag}`, name: 'Burger exemplo', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    const demoItem = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Burger exemplo', price: 20, position: 1, recipeId: demo.id } });
    const d = await createDraft(ownerM, 'MENU', { categorias: [{ nome: 'Bebidas', itens: [{ nome: 'coca-cola', descricao: '', preco: 7 }, { nome: 'Guaraná', descricao: '', preco: 6 }] }], incompleto: false });
    as(owner);
    const res = await APPLY(req({ payload: { categorias: [{ nome: 'Bebidas', itens: [{ nome: 'coca-cola', descricao: '', preco: 7 }, { nome: 'Guaraná', descricao: '', preco: '6,50' }] }], incompleto: false }, removeExample: true }), { params: { id: d.id } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 1, skipped: ['coca-cola'], removedExample: 1 });
    const g = await prisma.menuItem.findFirst({ where: { restaurantId: rid, name: 'Guaraná' } });
    expect(Number(g.price)).toBe(6.5);
    expect(g.recipeId).not.toBeNull();
    expect(Number((await prisma.menuItem.findFirst({ where: { restaurantId: rid, name: 'Coca-Cola' } })).price)).toBe(6);
    expect((await prisma.menuItem.findUnique({ where: { id: demoItem.id } })).active).toBe(false);
    expect((await prisma.aiDraft.findUnique({ where: { id: d.id } })).status).toBe('APPLIED');
  });

  it('tables: creates with QR and skips existing numbers; double confirm applies once', async () => {
    const s = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 40 } });
    await prisma.table.create({ data: { restaurantId: rid, sectionId: s.id, number: 2, capacity: 4 } });
    const d = await createDraft(ownerM, 'TABLES', { quantidade: 3, inicio: 1, area: 'Salão', lugares: 4 });
    as(owner);
    const body = { payload: { quantidade: 3, inicio: 1, area: 'Salão', lugares: 4 } };
    const [a, b] = await Promise.all([APPLY(req(body), { params: { id: d.id } }), APPLY(req(body), { params: { id: d.id } })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ok = a.status === 200 ? await a.json() : await b.json();
    expect(ok).toEqual({ created: [1, 3], skipped: [2] });
    const tables = await prisma.table.findMany({ where: { restaurantId: rid }, select: { number: true, qrToken: true } });
    expect(tables.length).toBe(3);
    expect(tables.filter((t) => t.number !== 2).every((t) => t.qrToken)).toBe(true);
  });

  it('staff: temporary password only in the response; manager cannot give GERENTE; result without password', async () => {
    const d = await createDraft(ownerM, 'STAFF', { pessoas: [{ nome: 'João', email: `joao-${tag}@gastrux.test`, papel: 'CAIXA' }, { nome: 'Lia', email: `lia-${tag}@gastrux.test`, papel: 'GERENTE' }] });
    as(manager);
    const refused = await APPLY(req({ payload: { pessoas: [{ nome: 'Lia', email: `lia-${tag}@gastrux.test`, papel: 'GERENTE' }] } }), { params: { id: d.id } });
    expect(refused.status).toBe(400);
    as(owner);
    const res = await APPLY(req({ payload: { pessoas: [{ nome: 'João', email: `joao-${tag}@gastrux.test`, papel: 'CAIXA' }] } }), { params: { id: d.id } });
    const out = await res.json();
    expect(out.people[0]).toMatchObject({ ok: true, nome: 'João' });
    expect(out.people[0].temporaryPassword).toMatch(/.{8,}/);
    const u = await prisma.user.findUnique({ where: { email: `joao-${tag}@gastrux.test` } });
    createdUserIds.push(u.id);
    expect(u).toMatchObject({ mustChangePassword: true, role: 'CASHIER' });
    const stored = await prisma.aiDraft.findUnique({ where: { id: d.id } });
    expect(JSON.stringify(stored.result)).not.toContain(out.people[0].temporaryPassword);
    const audit = await prisma.auditLog.findMany({ where: { restaurantId: rid } });
    expect(JSON.stringify(audit)).not.toContain(out.people[0].temporaryPassword);
  });

  it('junk from the review screen is refused naming the row, nothing written', async () => {
    const d = await createDraft(ownerM, 'MENU', { categorias: [{ nome: 'X', itens: [{ nome: 'a', descricao: '', preco: 1 }] }], incompleto: false });
    as(owner);
    const before = await prisma.menuItem.count({ where: { restaurantId: rid } });
    const res = await APPLY(req({ payload: { categorias: [{ nome: 'X', itens: [{ nome: 'Pastel', descricao: '', preco: 'abc' }] }], incompleto: false }, removeExample: false }), { params: { id: d.id } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Item 1 ("Pastel"): preço inválido');
    expect(await prisma.menuItem.count({ where: { restaurantId: rid } })).toBe(before);
    expect((await prisma.aiDraft.findUnique({ where: { id: d.id } })).status).toBe('PENDING');
  });

  it('other restaurant: 404 on GET, apply and discard; cook: 403; expired: 410', async () => {
    const d = await createDraft(ownerM, 'TABLES', { quantidade: 1, inicio: 50, area: 'Varanda', lugares: 2 });
    as(ownerB);
    expect((await GET_DRAFT(req(), { params: { id: d.id } })).status).toBe(404);
    expect((await APPLY(req({ payload: {} }), { params: { id: d.id } })).status).toBe(404);
    expect((await DISCARD(req(), { params: { id: d.id } })).status).toBe(404);
    as(cook);
    expect((await GET_DRAFT(req(), { params: { id: d.id } })).status).toBe(403);
    await prisma.aiDraft.update({ where: { id: d.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    as(owner);
    expect((await APPLY(req({ payload: { quantidade: 1, inicio: 50, area: 'Varanda', lugares: 2 } }), { params: { id: d.id } })).status).toBe(410);
  });

  it('GET marks duplicates; discard closes the draft', async () => {
    const d = await createDraft(ownerM, 'MENU', { categorias: [{ nome: 'Bebidas', itens: [{ nome: 'GUARANÁ', descricao: '', preco: 6 }] }], incompleto: true });
    as(owner);
    const g = await (await GET_DRAFT(req(), { params: { id: d.id } })).json();
    expect(g.marks.existingNames).toContain('GUARANÁ');
    expect(g.state).toBe('PENDING');
    expect((await DISCARD(req(), { params: { id: d.id } })).status).toBe(200);
    expect((await prisma.aiDraft.findUnique({ where: { id: d.id } })).status).toBe('DISCARDED');
  });
});
