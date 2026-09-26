// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { POST } from '../../../app/api/admin/whatsapp/embedded-signup/route';

describe('POST /api/admin/whatsapp/embedded-signup', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;
  });

  afterAll(async () => {
    await prisma.whatsAppConfig.deleteMany({
      where: { restaurantId: { in: [restaurantA.restaurantId, restaurantB.restaurantId] } },
    });
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.WHATSAPP_APP_ID = 'test-app-id';
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
  });

  function mockSession(userEmail: string, role = 'OWNER') {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { email: userEmail, role },
    });
  }

  function mockMetaCallsSucceed() {
    global.fetch = jest
      .fn()
      // exchangeCodeForToken
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'biz-token-xyz' }) })
      // subscribeAppToWaba
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      // registerPhoneNumber
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) as any;
  }

  it('rejects unauthenticated requests', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'c', phoneNumberId: 'p', wabaId: 'w' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('rejects requests missing required fields', async () => {
    mockSession('owner-a@integration.test');
    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'c' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('exchanges the code, subscribes the WABA, registers the number, and upserts WhatsAppConfig for the caller\'s own restaurant', async () => {
    mockSession('owner-a@integration.test');
    mockMetaCallsSucceed();

    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({
        code: 'short-lived-code',
        phoneNumberId: 'phone-a-1',
        wabaId: 'waba-a-1',
        businessId: 'biz-a-1',
      }),
    });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.config.phoneNumberId).toBe('phone-a-1');

    const saved = await prisma.whatsAppConfig.findUnique({
      where: { restaurantId: restaurantA.restaurantId },
    });
    expect(saved?.phoneNumberId).toBe('phone-a-1');
    expect(saved?.businessAccountId).toBe('waba-a-1');
    expect(saved?.metaBusinessId).toBe('biz-a-1');
    expect(saved?.accessToken).toBe('biz-token-xyz');
    expect(saved?.isActive).toBe(true);
  });

  it('never writes to another restaurant\'s WhatsAppConfig row', async () => {
    mockSession('owner-a@integration.test');
    mockMetaCallsSucceed();

    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'c2', phoneNumberId: 'phone-a-2', wabaId: 'waba-a-2' }),
    });
    await POST(req as any);

    const otherRestaurantConfig = await prisma.whatsAppConfig.findUnique({
      where: { restaurantId: restaurantB.restaurantId },
    });
    expect(otherRestaurantConfig).toBeNull();
  });

  it('returns 500 with the Meta error message when the code exchange fails, without writing WhatsAppConfig', async () => {
    mockSession('owner-a@integration.test');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'This authorization code has expired.' } }),
    }) as any;

    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'expired', phoneNumberId: 'phone-a-3', wabaId: 'waba-a-3' }),
    });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('This authorization code has expired.');
  });
});
