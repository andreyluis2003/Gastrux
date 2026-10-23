// @ts-nocheck
/** Equipe e acessos > Editar remuneração (2026-10-23): the commission rule could only be set when adding the person */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT } from '../../../app/api/admin/staff/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const put = (id, body) => PUT(new NextRequest(`http://x/api/admin/staff/${id}`, { method: 'PUT', body: JSON.stringify(body) }), { params: { id } });

describe('edit a staff member pay', () => {
  let rid, otherRid, owner, cook, garcom, alheio, userIds = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `sp-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Sp ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Sp2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    // A cook whose global role says OWNER (owner of another restaurant): the role in THIS restaurant counts
    const c = await prisma.user.create({ data: { email: `sp-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'OWNER', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'OWNER' };
    const g = await prisma.user.create({ data: { email: `sp-g-${tag}@gastrux.test`, name: 'Garçom', password: 'x', role: 'CASHIER' } });
    garcom = (await prisma.staffMember.create({ data: { restaurantId: rid, userId: g.id, role: 'CASHIER', commissionType: 'PERCENTAGE', commissionValue: 5 } })).id;
    const a = await prisma.user.create({ data: { email: `sp-a-${tag}@gastrux.test`, name: 'Alheio', password: 'x', role: 'CASHIER' } });
    alheio = (await prisma.staffMember.create({ data: { restaurantId: otherRid, userId: a.id, role: 'CASHIER' } })).id;
    userIds = [o.id, c.id, g.id, a.id];
  }, 60000);
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.staffMember.deleteMany({ where: { restaurantId: { in: [rid, otherRid] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [rid, otherRid] } } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { currentRestaurantId: null } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('the owner changes the rule; role and status in the body are ignored; it is audited', async () => {
    as(owner);
    const res = await put(garcom, { commissionType: 'FIXED', commissionValue: '2,50', role: 'MANAGER', staffRole: 'MANAGER', status: 'TERMINATED' });
    expect(res.status).toBe(200);
    const m = await prisma.staffMember.findUnique({ where: { id: garcom } });
    expect(m).toMatchObject({ commissionType: 'FIXED', role: 'CASHIER', status: 'ACTIVE' });
    expect(Number(m.commissionValue)).toBe(2.5);
    expect(await prisma.auditLog.count({ where: { entityType: 'StaffMember', entityId: garcom, action: 'UPDATE' } })).toBe(1);
  });

  it('refuses a percentage over 100', async () => {
    as(owner);
    expect((await put(garcom, { commissionType: 'PERCENTAGE', commissionValue: 150 })).status).toBe(400);
  });

  it('a cook here is refused even with a global OWNER role', async () => {
    as(cook);
    expect((await put(garcom, { commissionType: 'PERCENTAGE', commissionValue: 50 })).status).toBe(403);
  });

  it('a staff member of another restaurant is not found', async () => {
    as(owner);
    expect((await put(alheio, { commissionType: 'PERCENTAGE', commissionValue: 1 })).status).toBe(404);
  });
});
