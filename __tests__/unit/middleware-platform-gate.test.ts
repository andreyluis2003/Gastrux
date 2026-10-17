/**
 * The "Plataforma Gastrux" screens (all restaurants, users, audit, support, leads) are for the Gastrux
 * team only. A restaurant OWNER logged in must be sent away from the pages and get 403 from the APIs;
 * only role ADMIN or an e-mail in PLATFORM_ADMIN_EMAILS passes (owner question 2026-10-17: "os donos
 * de restaurantes estão tendo o bloqueio correto para não ver clientes de concorrentes?").
 */
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));

import { middleware } from '../../middleware';

const mockedGetToken = getToken as jest.Mock;

function as(token: Record<string, unknown>) {
  mockedGetToken.mockResolvedValue({ sub: 'u1', ...token });
}

async function visit(path: string) {
  return middleware(new NextRequest(new URL(path, 'https://gastrux.com')));
}

const PAGES = ['/admin/platform', '/admin/customers', '/admin/customers/cmabc', '/admin/users', '/admin/audit-logs', '/admin/support', '/admin/onboarding', '/admin/knowledge-base', '/admin/nurturing', '/admin/marketing/leads'];
const APIS = ['/api/admin/platform/metrics', '/api/admin/customers', '/api/admin/customers/cmabc', '/api/admin/users', '/api/admin/users/u2', '/api/admin/audit-logs', '/api/admin/support/tickets', '/api/admin/help/articles', '/api/admin/marketing/leads', '/api/admin/nurturing/content', '/api/admin/onboarding'];

describe('middleware: platform screens are for the Gastrux team only', () => {
  const env = process.env.PLATFORM_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = 'equipe@gastrux.com';
  });
  afterAll(() => {
    process.env.PLATFORM_ADMIN_EMAILS = env;
  });

  describe.each(['OWNER', 'MANAGER', 'CASHIER', 'COOK'])('restaurant %s', (role) => {
    beforeEach(() => as({ role, email: 'dono@restaurante.com' }));

    it.each(PAGES)('page %s sends to /dashboard', async (path) => {
      const res = await visit(path);
      expect(res.headers.get('location')).toBe('https://gastrux.com/dashboard');
    });

    it.each(APIS)('API %s answers 403', async (path) => {
      expect((await visit(path)).status).toBe(403);
    });
  });

  it('an e-mail on PLATFORM_ADMIN_EMAILS passes (any case)', async () => {
    as({ role: 'OWNER', email: 'Equipe@Gastrux.com' });
    expect((await visit('/admin/customers')).headers.get('location')).toBeNull();
    expect((await visit('/api/admin/customers')).status).not.toBe(403);
  });

  it('role ADMIN passes', async () => {
    as({ role: 'ADMIN', email: 'x@y.com' });
    expect((await visit('/api/admin/customers')).status).not.toBe(403);
  });

  it("the restaurant's own admin screens still open for the owner", async () => {
    as({ role: 'OWNER', email: 'dono@restaurante.com' });
    expect((await visit('/admin/settings/ia')).headers.get('location')).toBeNull();
    expect((await visit('/api/admin/staff')).status).not.toBe(403);
  });
});
