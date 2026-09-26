// @ts-nocheck
/**
 * Launch checklist f2-admins: a password someone else chose (a hire, a reset) is changed at the
 * first access. Each case states the DESIRED behaviour:
 * - a new hire gets a random temporary password and must change it (mustChangePassword);
 * - the change needs the temporary password, 8+ characters and a different password, and clears the flag;
 * - the login carries the flag into the session token (middleware.ts blocks pages and APIs until then);
 * - the team list (salaries, commissions) is only for the owner and managers of the restaurant.
 */
import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as listStaff, POST as hire } from '../../../app/api/admin/staff/route';
import { PATCH as updateProfile } from '../../../app/api/conta/profile/route';
import { authOptions } from '../../../lib/auth';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('first access with a temporary password', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const tag = crypto.randomBytes(3).toString('hex');
  const email = `novo-${tag}@first.test`;
  let temporaryPassword: string;
  let hiredId: string;

  const as = (id: string, mail: string, restaurantId: string) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id, email: mail, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (method: string, body?: any) =>
    new Request('http://localhost/x', { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }) as any;
  const changePassword = (currentPassword: string, newPassword: string) =>
    updateProfile(req('PATCH', { action: 'change_password', currentPassword, newPassword }));
  const credentialsLogin = (password: string) =>
    authOptions.providers.find((p: any) => p.id === 'credentials').options.authorize({ email, password });

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'enterprise' } });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.staffMember.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.user.deleteMany({ where: { email } });
    await cleanupMultiTenantData(ids);
  });

  it('a new hire gets a random temporary password and must change it', async () => {
    const owner = await prisma.user.findUnique({ where: { id: A.ownerId } });
    as(A.ownerId, owner.email, A.restaurantId);

    const res = await hire(req('POST', { name: 'Novo Caixa', email, staffRole: 'CASHIER' }));
    expect(res.status).toBeLessThan(300);
    const body = await res.json();
    temporaryPassword = body.temporaryPassword;
    expect(temporaryPassword).toBeTruthy();
    expect(temporaryPassword).not.toBe('temp123');

    const user = await prisma.user.findUnique({ where: { email } });
    hiredId = user.id;
    expect(user.mustChangePassword).toBe(true);
  });

  it('the login carries the flag into the session token', async () => {
    const logged = await credentialsLogin(temporaryPassword);
    expect(logged.mustChangePassword).toBe(true);
    const token = await authOptions.callbacks.jwt({ token: {}, user: logged });
    expect(token.mustChangePassword).toBe(true);
  });

  it('the team list (salaries) is refused to the cashier and shown to the owner', async () => {
    as(hiredId, email, A.restaurantId);
    expect((await listStaff()).status).toBe(403);

    const owner = await prisma.user.findUnique({ where: { id: A.ownerId } });
    as(A.ownerId, owner.email, A.restaurantId);
    const list = await listStaff();
    expect(list.status).toBe(200);
    expect((await list.json()).members.some((m: any) => m.user.email === email)).toBe(true);
  });

  it('the change needs the temporary password, 8+ characters and a new password', async () => {
    as(hiredId, email, A.restaurantId);
    expect((await changePassword('wrong-password', 'NovaSenha#2026')).status).toBe(400);
    expect((await changePassword(temporaryPassword, 'curta')).status).toBe(400);
    expect((await changePassword(temporaryPassword, temporaryPassword)).status).toBe(400);
    expect((await prisma.user.findUnique({ where: { email } })).mustChangePassword).toBe(true);
  });

  it('a successful change clears the flag, and the session refresh sees it', async () => {
    as(hiredId, email, A.restaurantId);
    const res = await changePassword(temporaryPassword, 'NovaSenha#2026');
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user.mustChangePassword).toBe(false);
    expect(await bcryptjs.compare('NovaSenha#2026', user.password)).toBe(true);

    const refreshed = await authOptions.callbacks.jwt({ token: { id: hiredId, email, role: 'CASHIER', mustChangePassword: true }, trigger: 'update' });
    expect(refreshed.mustChangePassword).toBe(false);
    expect((await credentialsLogin('NovaSenha#2026')).mustChangePassword).toBe(false);
  });
});
