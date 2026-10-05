/**
 * Anti-framing (clickjacking) headers. Printing opens /imprimir/* inside a hidden frame of the app
 * itself (lib/print/print-frame.ts): with "frame-ancestors 'none'" on every page the browser blocked
 * it, so the kitchen ticket, the receipt and the cash register receipts never printed (found in the
 * cash register browser check of 2026-10-05). Print pages may be framed by Gastrux itself only.
 */
import { NextRequest } from 'next/server';

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn().mockResolvedValue({ sub: 'user-1', id: 'user-1', email: 'a@b.test', role: 'OWNER', mustChangePassword: false }),
}));

import { middleware } from '../../middleware';

const visit = (path: string) => middleware(new NextRequest(new URL(path, 'https://gastrux.com')));

describe('middleware: framing', () => {
  it.each(['/imprimir/cupom/abc', '/imprimir/cozinha/abc', '/imprimir/caixa/lancamento/abc', '/imprimir/caixa/fechamento/abc'])(
    '%s can be framed by the app itself only',
    async (path) => {
      const res = await visit(path);
      expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    }
  );

  it.each(['/caixa', '/dashboard', '/imprimirx'])('%s cannot be framed at all', async (path) => {
    const res = await visit(path);
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});
