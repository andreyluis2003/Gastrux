// @ts-nocheck
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    restaurant: { findFirst: jest.fn() },
    restaurantUser: { findFirst: jest.fn() },
  },
}));
jest.mock('@/lib/whatsapp/get-restaurant', () => ({
  requireAdminSession: jest.fn(),
  getCurrentRestaurantId: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import { requireAdminSession, getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { requireRestaurantManager, requireConnectManager } from '../../lib/mercadopago-connect/guard';

const RESTAURANT = 'rest-1';

/** A tiny fake of the two lookups: is the user the owner, and which membership row do they have. */
function world(opts: { owner?: boolean; member?: { role: string; isActive: boolean } | null }) {
  (prisma.restaurant.findFirst as jest.Mock).mockImplementation(async ({ where }) =>
    opts.owner && where.id === RESTAURANT ? { id: RESTAURANT } : null
  );
  (prisma.restaurantUser.findFirst as jest.Mock).mockImplementation(async ({ where }) => {
    const m = opts.member;
    if (!m || where.restaurantId !== RESTAURANT) return null;
    if (where.isActive === true && !m.isActive) return null;
    if (where.role?.in && !where.role.in.includes(m.role)) return null;
    return { id: 'ru-1' };
  });
}

function session(user: any) {
  (requireAdminSession as jest.Mock).mockResolvedValue({ ok: true, session: { user } });
}

describe('requireRestaurantManager', () => {
  const savedEmails = process.env.PLATFORM_ADMIN_EMAILS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PLATFORM_ADMIN_EMAILS;
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(RESTAURANT);
    session({ id: 'u1', email: 'user@example.com', role: 'OWNER' });
    world({});
  });

  afterAll(() => {
    if (savedEmails === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = savedEmails;
  });

  it('allows the restaurant owner whatever the roles list', async () => {
    world({ owner: true });
    expect(await requireRestaurantManager(['ADMIN'])).toMatchObject({ ok: true, restaurantId: RESTAURANT, userId: 'u1' });
  });

  it('allows an active ADMIN member for [OWNER, ADMIN]', async () => {
    world({ member: { role: 'ADMIN', isActive: true } });
    expect(await requireRestaurantManager(['OWNER', 'ADMIN'])).toMatchObject({ ok: true });
  });

  it('denies a MANAGER member for [OWNER, ADMIN] but allows it once MANAGER is listed', async () => {
    world({ member: { role: 'MANAGER', isActive: true } });
    expect(await requireRestaurantManager(['OWNER', 'ADMIN'])).toEqual({
      ok: false,
      status: 403,
      error: 'Apenas o dono ou administrador pode gerenciar pagamentos',
    });
    expect(await requireRestaurantManager(['OWNER', 'ADMIN', 'MANAGER'])).toMatchObject({ ok: true });
  });

  it('denies an inactive member', async () => {
    world({ member: { role: 'MANAGER', isActive: false } });
    expect(await requireRestaurantManager(['OWNER', 'ADMIN', 'MANAGER'])).toMatchObject({ ok: false, status: 403 });
  });

  it('denies a globally-OWNER user who is only a CASHIER member here', async () => {
    session({ id: 'u1', email: 'user@example.com', role: 'OWNER' });
    world({ member: { role: 'CASHIER', isActive: true } });
    expect(await requireRestaurantManager(['OWNER', 'ADMIN', 'MANAGER'])).toMatchObject({ ok: false, status: 403 });
  });

  it('denies a non-staff user whose global role is ADMIN but who is not a member', async () => {
    session({ id: 'u1', email: 'user@example.com', role: 'ADMIN' });
    world({});
    expect(await requireRestaurantManager(['OWNER', 'ADMIN', 'MANAGER'])).toMatchObject({ ok: false, status: 403 });
  });

  it('denies a session with no role that is not a manager here', async () => {
    session({ id: 'u1', email: 'user@example.com' });
    world({ member: { role: 'CASHIER', isActive: true } });
    expect(await requireRestaurantManager(['OWNER', 'ADMIN', 'MANAGER'])).toMatchObject({ ok: false, status: 403 });
  });

  it('allows a platform-staff email without any membership', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'staff@gastrux.test, other@gastrux.test';
    session({ id: 'staff-1', email: 'Staff@Gastrux.test', role: 'CASHIER' });
    world({});
    expect(await requireRestaurantManager(['OWNER'])).toMatchObject({ ok: true, restaurantId: RESTAURANT });
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });

  it('uses the caller-provided text for a denied member', async () => {
    world({});
    expect(await requireRestaurantManager(['OWNER'], 'Sem permissão')).toEqual({ ok: false, status: 403, error: 'Sem permissão' });
  });

  it('propagates 401/403 from the session check, 403 for no user id, 404 for no restaurant', async () => {
    (requireAdminSession as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401, error: 'Não autenticado' });
    expect(await requireRestaurantManager(['OWNER'])).toEqual({ ok: false, status: 401, error: 'Não autenticado' });

    session({ email: 'user@example.com', role: 'OWNER' });
    expect(await requireRestaurantManager(['OWNER'])).toEqual({ ok: false, status: 403, error: 'Sessão inválida' });

    session({ id: 'u1', email: 'user@example.com', role: 'OWNER' });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValueOnce(null);
    expect(await requireRestaurantManager(['OWNER'])).toEqual({ ok: false, status: 404, error: 'Restaurante não encontrado' });
  });

  it('requireConnectManager stays owner/admin only', async () => {
    world({ member: { role: 'ADMIN', isActive: true } });
    expect(await requireConnectManager()).toMatchObject({ ok: true });

    world({ member: { role: 'MANAGER', isActive: true } });
    expect(await requireConnectManager()).toEqual({
      ok: false,
      status: 403,
      error: 'Apenas o dono ou administrador pode gerenciar pagamentos',
    });
  });
});
