// @ts-nocheck
/**
 * POST /api/pagamentos/mp/refund is authorized by membership in the CURRENT
 * restaurant (requireRestaurantManager), not by the global JWT role. DB-free:
 * prisma, the session helpers and every Mercado Pago call are mocked; the real
 * guard runs.
 */
const prismaMock = {
  restaurant: { findFirst: jest.fn() },
  restaurantUser: { findFirst: jest.fn() },
  payment: { findFirst: jest.fn(), update: jest.fn() },
  paymentRefund: { create: jest.fn() },
  order: { updateMany: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/whatsapp/get-restaurant', () => ({
  requireAdminSession: jest.fn(),
  getCurrentRestaurantId: jest.fn(),
}));
jest.mock('@/lib/mercado-pago', () => ({ refundPayment: jest.fn() }));
jest.mock('@/lib/mercadopago-connect/connection-service', () => ({ getMpClientForRestaurant: jest.fn() }));
jest.mock('@/lib/mercadopago-connect/payments', () => ({ refundConnectPayment: jest.fn() }));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn(), trackApiCall: jest.fn() }));

import { requireAdminSession, getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { refundPayment } from '@/lib/mercado-pago';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { refundConnectPayment } from '@/lib/mercadopago-connect/payments';
import { POST } from '../../app/api/pagamentos/mp/refund/route';

const RESTAURANT = 'rest-1';
const post = (body: any = { paymentId: 'pay-1' }) =>
  POST(new Request('https://gastrux.test/api/pagamentos/mp/refund', { method: 'POST', body: JSON.stringify(body) }) as any);

function world(opts: { owner?: boolean; member?: { role: string; isActive: boolean } | null }) {
  prismaMock.restaurant.findFirst.mockImplementation(async ({ where }) =>
    opts.owner && where.id === RESTAURANT ? { id: RESTAURANT } : null
  );
  prismaMock.restaurantUser.findFirst.mockImplementation(async ({ where }) => {
    const m = opts.member;
    if (!m || where.restaurantId !== RESTAURANT) return null;
    if (where.isActive === true && !m.isActive) return null;
    if (where.role?.in && !where.role.in.includes(m.role)) return null;
    return { id: 'ru-1' };
  });
}

describe('refund route authorization', () => {
  const savedEmails = process.env.PLATFORM_ADMIN_EMAILS;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PLATFORM_ADMIN_EMAILS;
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(RESTAURANT);
    // a globally-MANAGER user (JWT role), as the old check required
    (requireAdminSession as jest.Mock).mockResolvedValue({
      ok: true,
      session: { user: { id: 'u1', email: 'u1@example.com', role: 'MANAGER' } },
    });
    world({});
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      restaurantId: RESTAURANT,
      orderId: 'order-1',
      status: 'APPROVED',
      amount: 50,
      currency: 'BRL',
      gateway: 'MERCADO_PAGO_CONNECT',
      gatewayPaymentId: '999',
      refunds: [],
      mercadoPagoData: null,
    });
    (getMpClientForRestaurant as jest.Mock).mockResolvedValue({});
    (refundConnectPayment as jest.Mock).mockResolvedValue({ id: 'rf-1' });
    prismaMock.paymentRefund.create.mockResolvedValue({ id: 'refund-row' });
    prismaMock.payment.update.mockResolvedValue({});
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => errSpy.mockRestore());
  afterAll(() => {
    if (savedEmails === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = savedEmails;
  });

  it('a globally-MANAGER user who is only a CASHIER member here gets 403 and Mercado Pago is never called', async () => {
    world({ member: { role: 'CASHIER', isActive: true } });
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/reembols/i);
    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect(refundPayment).not.toHaveBeenCalled();
    expect(prismaMock.paymentRefund.create).not.toHaveBeenCalled();
  });

  it('a globally-MANAGER user with no membership here at all gets 403', async () => {
    world({ member: null });
    expect((await post()).status).toBe(403);
    expect(refundConnectPayment).not.toHaveBeenCalled();
  });

  it('an inactive MANAGER member gets 403', async () => {
    world({ member: { role: 'MANAGER', isActive: false } });
    expect((await post()).status).toBe(403);
    expect(refundConnectPayment).not.toHaveBeenCalled();
  });

  it('an active MANAGER member of this restaurant can refund, scoped to this restaurant', async () => {
    world({ member: { role: 'MANAGER', isActive: true } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(prismaMock.payment.findFirst.mock.calls[0][0].where).toEqual({ id: 'pay-1', restaurantId: RESTAURANT });
    expect(getMpClientForRestaurant).toHaveBeenCalledWith(RESTAURANT);
    expect(refundConnectPayment).toHaveBeenCalledTimes(1);
    expect(prismaMock.paymentRefund.create.mock.calls[0][0].data.processedById).toBe('u1');
  });

  it('the restaurant owner can refund', async () => {
    world({ owner: true });
    expect((await post()).status).toBe(200);
  });

  it('no session is 401; no current restaurant is 404; both before any Mercado Pago call', async () => {
    (requireAdminSession as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401, error: 'Não autenticado' });
    expect((await post()).status).toBe(401);
    (getCurrentRestaurantId as jest.Mock).mockResolvedValueOnce(null);
    expect((await post()).status).toBe(404);
    expect(refundConnectPayment).not.toHaveBeenCalled();
  });
});
