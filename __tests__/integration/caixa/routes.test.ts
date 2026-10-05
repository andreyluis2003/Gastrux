// __tests__/integration/caixa/routes.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as listRegisters, POST as createRegister } from '../../../app/api/caixa/registers/route';
import { POST as openShift, GET as history } from '../../../app/api/caixa/sessions/route';
import { GET as current } from '../../../app/api/caixa/sessions/current/route';
import { GET as detail } from '../../../app/api/caixa/sessions/[id]/route';
import { POST as entries } from '../../../app/api/caixa/sessions/[id]/entries/route';
import { POST as close } from '../../../app/api/caixa/sessions/[id]/close/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash register routes', () => {
  let A, B, cashierId;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url, method = 'GET', body?) => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  const json = async (res) => ({ status: res.status, body: await res.json() });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `cx-${tag}@routes.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    cashierId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashierId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await cleanupMultiTenantData(ids);
  });

  it('full cashier flow: list -> open -> sangria -> current hides expected -> close', async () => {
    as(cashierId, A.restaurantId);
    const { body: { registers, role } } = await json(await listRegisters(req('http://x/api/caixa/registers')));
    expect(role).toBe('CASHIER'); // the screen hides manager-only buttons with it
    expect(registers[0]).toMatchObject({ name: 'Caixa principal', openSession: null });
    const reg = registers[0].id;

    const opened = await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: reg, openingFloat: '100,00' })));
    expect(opened.status).toBe(201);
    const id = opened.body.session.id;

    const again = await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: reg, openingFloat: 0 })));
    expect(again.status).toBe(200);
    expect(again.body.alreadyOpen).toBe(true);

    expect((await json(await entries(req(`http://x/api/caixa/sessions/${id}/entries`, 'POST', { type: 'WITHDRAWAL', amount: 20, description: 'cofre' }), { params: { id } }))).status).toBe(201);
    expect((await json(await entries(req(`http://x/api/caixa/sessions/${id}/entries`, 'POST', { type: 'EXPENSE', amount: 5, category: 'compras', description: 'x' }), { params: { id } }))).status).toBe(403);

    const cur = await json(await current(req(`http://x/api/caixa/sessions/current?cashRegisterId=${reg}`)));
    expect(cur.body.view.expected).toBeNull();
    expect(cur.body.view).not.toHaveProperty('balance'); // no running cash balance for the cashier

    const closed = await json(await close(req(`http://x/api/caixa/sessions/${id}/close`, 'POST', { counted: { dinheiro: '80' } }), { params: { id } }));
    expect(closed.body.result.difference.dinheiro).toBe(0);
  });

  it('history and register creation are for managers; other restaurants get 404', async () => {
    as(cashierId, A.restaurantId);
    expect((await history(req('http://x/api/caixa/sessions'))).status).toBe(403);
    expect((await createRegister(req('http://x/api/caixa/registers', 'POST', { name: 'Caixa 2' }))).status).toBe(403);
    as(A.ownerId, A.restaurantId);
    const created = await json(await createRegister(req('http://x/api/caixa/registers', 'POST', { name: 'Caixa Balcão' })));
    expect(created.status).toBe(201);
    const { body } = await json(await history(req('http://x/api/caixa/sessions')));
    expect(body.sessions.length).toBeGreaterThan(0);
    as(B.ownerId, B.restaurantId);
    expect((await detail(req(`http://x/api/caixa/sessions/${body.sessions[0].id}`), { params: { id: body.sessions[0].id } })).status).toBe(404);
  });

  it('invalid values are 400 with a Portuguese message', async () => {
    as(A.ownerId, A.restaurantId);
    const { body: { registers } } = await json(await listRegisters(req('http://x/api/caixa/registers')));
    const res = await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: registers[0].id, openingFloat: '-5' })));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Troco inicial/);
  });
});
