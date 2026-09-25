// @ts-nocheck
/**
 * The legacy, unsigned receiver POST /api/pagamentos/webhook is neutralized
 * (ruling R17). It must never read or write anything, whatever the body says.
 * DB-free: prisma is mocked and every accessor is asserted untouched.
 */

const prismaMock = {
  payment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  mercadoPagoTransaction: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { POST, dynamic } from '../../app/api/pagamentos/webhook/route';

function allPrismaCalls() {
  return Object.values(prismaMock).flatMap((model: any) => Object.values(model));
}

describe('legacy POST /api/pagamentos/webhook (deprecated, neutralized)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('stays force-dynamic and still exports POST', () => {
    expect(dynamic).toBe('force-dynamic');
    expect(typeof POST).toBe('function');
  });

  it.each([
    ['an approved payment replay', { type: 'payment', data: { id: '123', status: 'approved' } }],
    ['a refund', { type: 'payment', data: { id: '123', status: 'refunded' } }],
    ['a genuine notification without a status', { type: 'payment', data: { id: '123' } }],
    ['an unknown type', { type: 'merchant_order', data: { id: '9' } }],
    ['an empty body', {}],
  ])('answers 200 { ok, deprecated } and touches no prisma model for %s', async (_label, body) => {
    const request = {
      json: jest.fn(async () => body),
      headers: new Headers(),
      url: 'https://gastrux.test/api/pagamentos/webhook',
    } as any;

    const res = await POST(request);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deprecated: true });

    // It never even reads the body, so no Payment can be derived from it.
    expect(request.json).not.toHaveBeenCalled();
    for (const fn of allPrismaCalls()) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('warns that a notification hit the deprecated route without logging the body', async () => {
    await POST({ json: jest.fn(async () => ({ type: 'payment', data: { id: 'secret-id' } })) } as any);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0].join(' ');
    expect(logged).toContain('deprecated');
    expect(logged).not.toContain('secret-id');
  });
});
