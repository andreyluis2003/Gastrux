// @ts-nocheck
/** Cadastro de entregadores (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as list, POST as create } from '../../../app/api/delivery/drivers/route';
import { PATCH as update } from '../../../app/api/delivery/drivers/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cadastro de entregadores', () => {
  let A, B, cashierId;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url, method = 'GET', body?) => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const post = async (body) => json(await create(req('http://x/api/delivery/drivers', 'POST', body)));
  const patch = async (id, body) => json(await update(req(`http://x/api/delivery/drivers/${id}`, 'PATCH', body), { params: { id } }));
  const get = async (query = '') => json(await list(req(`http://x/api/delivery/drivers${query}`)));

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `drv-${tag}@routes.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    cashierId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
  }, 60000);
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.driver.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashierId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await cleanupMultiTenantData(ids);
  });

  it('cashier cannot create a driver', async () => {
    as(cashierId, A.restaurantId);
    const { status } = await post({ name: 'Zé' });
    expect(status).toBe(403);
    expect(await prisma.driver.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
  });

  it('manager creates with daily and per delivery', async () => {
    as(A.ownerId, A.restaurantId);
    const { status, body } = await post({ name: '  João   da Moto ', phone: '(11) 99999-8888', dailyRate: '40', perDelivery: '8,50' });
    expect(status).toBe(201);
    const saved = await prisma.driver.findUnique({ where: { id: body.driver.id } });
    expect(saved).toMatchObject({ restaurantId: A.restaurantId, name: 'João da Moto', phone: '11999998888', dailyRateCents: 4000, perDeliveryCents: 850, active: true });
    const audit = await prisma.auditLog.findFirst({ where: { restaurantId: A.restaurantId, entityType: 'Driver', entityId: saved.id, action: 'CREATE' } });
    expect(audit).toBeTruthy();

    // Empty rates are zero; a bad phone or a bad value is refused
    const plain = await post({ name: 'Pedro', dailyRate: '', perDelivery: '' });
    expect(plain.status).toBe(201);
    expect(plain.body.driver).toMatchObject({ dailyRateCents: 0, perDeliveryCents: 0, phone: null });
    expect((await post({ name: 'Ana', phone: '123' })).body.error).toBe('Celular inválido: use DDD e número');
    expect((await post({ name: 'Ana', dailyRate: 'abc' })).status).toBe(400);
    expect((await post({ name: '   ' })).status).toBe(400);
    // Rates up to R$ 1.000,00 each (a typo like "4000" for "40,00" is refused)
    expect(await post({ name: 'Ana', dailyRate: '1000,01' })).toMatchObject({ status: 400, body: { error: 'Valor muito alto: até R$ 1.000,00' } });
    expect(await post({ name: 'Ana', perDelivery: '4000' })).toMatchObject({ status: 400, body: { error: 'Valor muito alto: até R$ 1.000,00' } });
    const top = await post({ name: 'Ana Teto', dailyRate: '1000', perDelivery: '1000,00' });
    expect(top.status).toBe(201);
    expect(top.body.driver).toMatchObject({ dailyRateCents: 100000, perDeliveryCents: 100000 });
    expect(await patch(top.body.driver.id, { perDelivery: '1000,01' })).toMatchObject({ status: 400, body: { error: 'Valor muito alto: até R$ 1.000,00' } });
    await prisma.auditLog.deleteMany({ where: { entityId: top.body.driver.id } });
    await prisma.driver.delete({ where: { id: top.body.driver.id } }); // keeps the list of the GET test below
  });

  it('duplicate active name is refused', async () => {
    as(A.ownerId, A.restaurantId);
    const { status, body } = await post({ name: 'joão da moto' });
    expect(status).toBe(409);
    expect(body.error).toBe('Já existe um entregador ativo com esse nome');
    // Renaming another one to it is refused too
    const pedro = await prisma.driver.findFirst({ where: { restaurantId: A.restaurantId, name: 'Pedro' } });
    expect((await patch(pedro.id, { name: 'João da Moto' })).status).toBe(409);
    // Another restaurant may use the same name
    as(B.ownerId, B.restaurantId);
    expect((await post({ name: 'João da Moto' })).status).toBe(201);
  });

  it('deactivated name can be reused', async () => {
    as(A.ownerId, A.restaurantId);
    const joao = await prisma.driver.findFirst({ where: { restaurantId: A.restaurantId, name: 'João da Moto' } });
    const off = await patch(joao.id, { active: false });
    expect(off.status).toBe(200);
    expect(off.body.driver.active).toBe(false);
    const again = await post({ name: 'João da Moto', perDelivery: '7' });
    expect(again.status).toBe(201);
    expect(again.body.driver.perDeliveryCents).toBe(700);
    // Turning the old one back on would make two active "João da Moto"
    expect((await patch(joao.id, { active: true })).status).toBe(409);
    // Editing values works and is audited
    const edited = await patch(again.body.driver.id, { dailyRate: '45,5', phone: '' });
    expect(edited.status).toBe(200);
    expect(edited.body.driver).toMatchObject({ dailyRateCents: 4550, perDeliveryCents: 700, phone: null });
    expect(await prisma.auditLog.count({ where: { restaurantId: A.restaurantId, entityType: 'Driver', action: 'UPDATE' } })).toBeGreaterThanOrEqual(2);
  });

  it("other restaurant's driver is 404 on PATCH", async () => {
    const other = await prisma.driver.findFirst({ where: { restaurantId: B.restaurantId } });
    as(A.ownerId, A.restaurantId);
    const { status } = await patch(other.id, { name: 'Roubado' });
    expect(status).toBe(404);
    expect((await prisma.driver.findUnique({ where: { id: other.id } })).name).toBe('João da Moto');
  });

  it('GET lists active only by default', async () => {
    as(cashierId, A.restaurantId);
    const active = await get();
    expect(active.status).toBe(200);
    expect(active.body.drivers.map((d) => d.name).sort()).toEqual(['João da Moto', 'Pedro']);
    expect(active.body.drivers.every((d) => d.active)).toBe(true);
    const all = await get('?all=1');
    expect(all.body.drivers).toHaveLength(3);
    expect(all.body.drivers.some((d) => d.restaurantId !== A.restaurantId)).toBe(false);
  });
});
