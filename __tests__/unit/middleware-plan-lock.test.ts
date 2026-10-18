/** Plans of 2026-10-18 §6: a locked restaurant reads but does not write */
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));

import { middleware } from '../../middleware';

const as = (t: Record<string, unknown>) => (getToken as jest.Mock).mockResolvedValue({ sub: 'u1', role: 'OWNER', email: 'dono@r.com', ...t });
const call = (path: string, method = 'POST') => middleware(new NextRequest(new URL(path, 'https://gastrux.com'), { method }));

describe('middleware: plan lock', () => {
  const env = process.env.PLATFORM_ADMIN_EMAILS;
  afterAll(() => {
    process.env.PLATFORM_ADMIN_EMAILS = env;
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s of a locked restaurant answers 402 PLAN_REQUIRED', async (method) => {
    as({ planLocked: true });
    const res = await call('/api/comanda/sessions/s1/items', method);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'Seu teste terminou. Escolha um plano para voltar a vender.', code: 'PLAN_REQUIRED' });
  });

  it('GET still works', async () => {
    as({ planLocked: true });
    expect((await call('/api/comanda/sessions/s1', 'GET')).status).not.toBe(402);
  });

  it.each(['/api/billing/mp/checkout-session', '/api/auth/session', '/api/conta/profile', '/api/support/tickets', '/api/feedback', '/api/notifications/read', '/api/password/reset', '/api/admin/multi-location/switch'])('%s stays open', async (path) => {
    as({ planLocked: true });
    expect((await call(path)).status).not.toBe(402);
  });

  it('not locked, or a token without the claim (logged in before the deploy), passes', async () => {
    as({ planLocked: false });
    expect((await call('/api/comanda/sessions/s1/items')).status).not.toBe(402);
    as({});
    expect((await call('/api/comanda/sessions/s1/items')).status).not.toBe(402);
  });

  it('platform admin never locked', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'equipe@gastrux.com';
    as({ planLocked: true, email: 'equipe@gastrux.com' });
    expect((await call('/api/comanda/sessions/s1/items')).status).not.toBe(402);
  });
});
