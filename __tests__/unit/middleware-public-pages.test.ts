/**
 * The delivery storefront is where the restaurant's customers order and pay: they have no Gastrux
 * account, so the page must open without login. It sent everyone to /auth/signin (found in the
 * Mercado Pago homologation test of 2026-10-04), while the dashboard must stay protected.
 */
import { NextRequest } from 'next/server';

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn().mockResolvedValue(null) }));

import { middleware } from '../../middleware';

async function visit(path: string) {
  return middleware(new NextRequest(new URL(path, 'https://homolog.gastrux.com')));
}

function redirectsToSignIn(res: Response): boolean {
  return (res.headers.get('location') || '').includes('/auth/signin');
}

describe('middleware: public pages without login', () => {
  it.each([
    '/delivery/cmushbbri0001nx0klhijo24p',
    '/delivery/cmushbbri0001nx0klhijo24p?payment=abc&result=success',
    '/menu/qr-token',
  ])('%s opens for a visitor', async (path) => {
    expect(redirectsToSignIn(await visit(path))).toBe(false);
  });

  it.each(['/dashboard', '/dashboard/pagamentos/conectar', '/deliveryx'])(
    '%s still requires login',
    async (path) => {
      expect(redirectsToSignIn(await visit(path))).toBe(true);
    }
  );
});
