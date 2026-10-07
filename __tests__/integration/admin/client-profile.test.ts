// @ts-nocheck
/**
 * Platform client management (2026-10-07): the client's file (contact, sign-up answers, usage,
 * alerts), the funnel, the team's notes, and that only the Gastrux team gets in.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { clientProfiles, clientFunnel } from '../../../lib/admin/client-profile';
import { GET as LIST } from '../../../app/api/admin/customers/route';
import { GET as ONE } from '../../../app/api/admin/customers/[id]/route';
import { POST as NOTE, DELETE as UNNOTE } from '../../../app/api/admin/customers/[id]/notes/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const TEAM = `equipe-${tag}@gastrux.test`;
const as = (email: string, role = 'OWNER') => (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'x', email, role }, expires: '2099-01-01' });

describe('platform client management', () => {
  let busy: string, idle: string, ownerId: string, idleOwnerId: string;
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const envBefore = process.env.PLATFORM_ADMIN_EMAILS;

  beforeAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = TEAM;
    const o = await prisma.user.create({
      data: { email: `dono-${tag}@gastrux.test`, name: 'Maria Dona', password: 'x', role: 'OWNER', lastSignInAt: daysAgo(1),
        businessStage: 'operating', businessType: 'pizzaria', locationCount: '1', mainPainPoint: 'cmv', leadQuality: 'qualified' },
    });
    ownerId = o.id;
    const r = await prisma.restaurant.create({
      data: { name: `Pizzaria ${tag}`, ownerId, phone: '(11) 98888-7777', address: 'Rua A, 1', status: 'TRIAL', subscriptionStatus: 'trialing',
        trialEndsAt: new Date(now.getTime() + 2 * 86_400_000), createdAt: daysAgo(10) },
    });
    busy = r.id;
    await prisma.restaurantUser.create({ data: { restaurantId: busy, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: busy, name: 'Pizzas', position: 0, active: true } });
    await prisma.menuItem.create({ data: { restaurantId: busy, categoryId: cat.id, name: 'Calabresa', price: 50, position: 0 } });
    await prisma.orderSession.create({ data: { restaurantId: busy, userId: ownerId, status: 'CLOSED', closedAt: daysAgo(3) } });
    await prisma.orderSession.create({ data: { restaurantId: busy, userId: ownerId, status: 'CLOSED', closedAt: daysAgo(40) } });
    await prisma.orderSession.create({ data: { restaurantId: busy, userId: ownerId, status: 'OPEN' } });

    const o2 = await prisma.user.create({ data: { email: `parado-${tag}@gastrux.test`, name: 'Joao', password: 'x', role: 'OWNER', lastSignInAt: daysAgo(12) } });
    idleOwnerId = o2.id;
    idle = (await prisma.restaurant.create({ data: { name: `Parado ${tag}`, ownerId: idleOwnerId, status: 'TRIAL', createdAt: daysAgo(12), trialEndsAt: daysAgo(-2) } })).id;
  }, 60000);

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = envBefore;
    for (const id of [busy, idle]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    for (const id of [ownerId, idleOwnerId]) { try { await prisma.user.delete({ where: { id } }); } catch {} }
  });

  it('builds the client file: contact, answers, usage, stage and alerts', async () => {
    const p = (await clientProfiles([busy, idle], now));
    const a = p.get(busy);
    expect(a.contact).toMatchObject({ ownerName: 'Maria Dona', phone: '(11) 98888-7777', addressMissing: false });
    expect(a.answers.map((x) => x.answer)).toEqual(expect.arrayContaining(['Já em operação', '1 unidade', 'Custo de receita / CMV', 'Qualificado']));
    expect(a.usage).toMatchObject({ menuItems: 1, closedBills: 2, closedBills30d: 1, users: 1, mercadoPago: 'Não conectado', fiscal: 'Não configurado' });
    expect(a.stage).toBe('SELLING');
    expect(a.alerts.map((x) => x.text)).toEqual(['Teste acaba em 2 dias']);

    const b = p.get(idle);
    expect(b.stage).toBe('SIGNED_UP');
    expect(b.contact.addressMissing).toBe(true);
    expect(b.alerts.map((x) => x.text)).toEqual(expect.arrayContaining(['Sem entrar há 12 dias', 'Parado no cadastro: sem cardápio']));
  });

  it('the funnel counts every live client', async () => {
    const f = await clientFunnel(now);
    expect(f.stageIds('SELLING')).toContain(busy);
    expect(f.stageIds('SIGNED_UP')).toContain(idle);
    expect(f.attentionIds).toEqual(expect.arrayContaining([busy, idle]));
  });

  it('a restaurant owner never gets in; the team does', async () => {
    as(`dono-${tag}@gastrux.test`);
    expect((await LIST(new NextRequest('http://x/api/admin/customers'))).status).toBe(401);
    expect((await ONE(new NextRequest('http://x'), { params: { id: busy } })).status).toBe(401);
    expect((await NOTE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ text: 'oi' }) }), { params: { id: busy } })).status).toBe(401);

    as(TEAM);
    const res = await LIST(new NextRequest(`http://x/api/admin/customers?search=${encodeURIComponent('Maria Dona')}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customers.map((c) => c.id)).toEqual([busy]);
    expect(body.customers[0].profile.stage).toBe('SELLING');
    expect(body.funnel.total).toBeGreaterThanOrEqual(2);

    const focused = await (await LIST(new NextRequest('http://x/api/admin/customers?stage=SIGNED_UP&limit=200'))).json();
    expect(focused.customers.map((c) => c.id)).toContain(idle);
    expect(focused.customers.map((c) => c.id)).not.toContain(busy);
  });

  it('the team writes and removes notes; a note of one client cannot be removed through another', async () => {
    as(TEAM);
    expect((await NOTE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ text: '  ' }) }), { params: { id: busy } })).status).toBe(400);
    const created = await NOTE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ text: 'Liguei, vai testar o caixa' }) }), { params: { id: busy } });
    expect(created.status).toBe(201);
    const note = await created.json();
    expect(note.authorEmail).toBe(TEAM);

    const file = await (await ONE(new NextRequest('http://x'), { params: { id: busy } })).json();
    expect(file.notes.map((n) => n.text)).toEqual(['Liguei, vai testar o caixa']);
    expect(file.profile.contact.ownerName).toBe('Maria Dona');

    expect((await UNNOTE(new NextRequest(`http://x?noteId=${note.id}`, { method: 'DELETE' }), { params: { id: idle } })).status).toBe(404);
    expect((await UNNOTE(new NextRequest(`http://x?noteId=${note.id}`, { method: 'DELETE' }), { params: { id: busy } })).status).toBe(200);
  });
});
