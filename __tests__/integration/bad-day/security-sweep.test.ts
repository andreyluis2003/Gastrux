// @ts-nocheck
/**
 * Launch checklist f2-security (2026-09-28): the rest of the API. Each case states the DESIRED behaviour:
 * - jobs for the platform (e-mail batches, counters, onboarding e-mails) need CRON_SECRET and fail
 *   closed without it (one accepted anyone when its variable was unset, another used "default-secret");
 * - the voice webhooks only accept requests signed by the restaurant's Twilio token (a forged POST
 *   could make the agent create reservations);
 * - the delivery-status webhook needs its token;
 * - menu, prices, money and settings are changed by the owner or a manager, never by a cashier;
 * - a public reservation never returns the stored guest profile.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as batchEmail } from '../../../app/api/admin/batch-email-send/route';
import { POST as cleanupCounters } from '../../../app/api/admin/cleanup-transaction-counters/route';
import { POST as sendOnboarding } from '../../../app/api/email/send-onboarding/route';
import { GET as checkOnboarding } from '../../../app/api/email/check-onboarding-emails/route';
import { POST as voiceIncoming } from '../../../app/api/voice/webhook/incoming/route';
import { POST as messagingWebhook } from '../../../app/api/messaging/webhook/[provider]/route';
import { POST as createMenuItem } from '../../../app/api/cardapio/itens/route';
import { POST as createModifier } from '../../../app/api/modifiers/route';
import { POST as createReservation } from '../../../app/api/reservations/route';
import { computeTwilioSignature } from '../../../lib/voice/twilio-signature';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('security sweep of the rest of the API', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let cashier: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const env = { ...process.env };

  const as = (userId: string, restaurantId: string) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const json = (url: string, body: any, headers: Record<string, string> = {}) =>
    new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) as any;

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    cashier = await prisma.user.create({ data: { email: `cx-${tag}@sweep.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: cashier.id, role: 'CASHIER', isActive: true } });
  });
  afterAll(async () => {
    process.env = env;
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.voiceCall.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.voiceAgentConfig.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.reservation.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.guestProfile.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.itemModifier.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashier.id } });
    await prisma.user.deleteMany({ where: { id: cashier.id } });
    await cleanupMultiTenantData(ids);
  });
  afterEach(() => { process.env = { ...env }; });

  describe('platform jobs need CRON_SECRET, and refuse when it is not configured', () => {
    it('with no secret configured, a request without credentials is refused (it used to pass)', async () => {
      delete process.env.CRON_SECRET;
      delete process.env.ADMIN_CLEANUP_SECRET;
      expect((await batchEmail(json('http://x/api/admin/batch-email-send', { emailType: 'day3' }))).status).toBe(401);
      expect((await cleanupCounters(json('http://x/api/admin/cleanup-transaction-counters', {}, { 'X-Admin-Secret': 'default-secret' }))).status).toBe(401);
      expect((await sendOnboarding(json('http://x/api/email/send-onboarding', { userId: A.ownerId, day: '3' }))).status).toBe(401);
      expect((await checkOnboarding(new Request('http://x/api/email/check-onboarding-emails') as any)).status).toBe(401);
    });

    it('with the secret configured, only the right one passes', async () => {
      process.env.CRON_SECRET = 'segredo-de-teste-123';
      expect((await cleanupCounters(json('http://x/api/admin/cleanup-transaction-counters', {}, { Authorization: 'Bearer errado' }))).status).toBe(401);
      expect((await cleanupCounters(json('http://x/api/admin/cleanup-transaction-counters', {}, { Authorization: 'Bearer segredo-de-teste-123' }))).status).toBe(200);
    });
  });

  describe('voice webhooks only accept Twilio, signed with the restaurant token', () => {
    const TOKEN = 'twilio-token-de-teste';
    const PHONE = `+5511${String(Date.now()).slice(-8)}`;
    const form = (params: Record<string, string>) => { const f = new URLSearchParams(params); return f.toString(); };
    const call = (params: Record<string, string>, signature?: string) =>
      voiceIncoming(new Request('https://gastrux.test/api/voice/webhook/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(signature ? { 'X-Twilio-Signature': signature } : {}) },
        body: form(params),
      }) as any);

    beforeAll(async () => {
      process.env.NEXTAUTH_URL = 'https://gastrux.test';
      await prisma.voiceAgentConfig.create({ data: { restaurantId: A.restaurantId, twilioAuthToken: TOKEN, twilioPhoneNumber: PHONE, isActive: true } });
    });

    it('a forged call (no or wrong signature) creates nothing', async () => {
      process.env.NEXTAUTH_URL = 'https://gastrux.test';
      const params = { CallSid: `CA-forged-${tag}`, From: '+5511999999999', To: PHONE };
      await call(params);
      await call(params, 'assinatura-falsa');
      expect(await prisma.voiceCall.count({ where: { callSid: params.CallSid } })).toBe(0);
    });

    it('a call signed with the restaurant token is answered and recorded', async () => {
      process.env.NEXTAUTH_URL = 'https://gastrux.test';
      const params = { CallSid: `CA-real-${tag}`, From: '+5511999999999', To: PHONE };
      const sig = computeTwilioSignature(TOKEN, 'https://gastrux.test/api/voice/webhook/incoming', params);
      const res = await call(params, sig);
      expect(res.status).toBe(200);
      expect(await prisma.voiceCall.count({ where: { callSid: params.CallSid, restaurantId: A.restaurantId } })).toBe(1);
    });
  });

  it('the delivery-status webhook needs its token', async () => {
    delete process.env.MESSAGING_WEBHOOK_SECRET;
    const body = { providerMsgId: 'x', status: 'READ' };
    expect((await messagingWebhook(json('http://x/api/messaging/webhook/zenvia', body), { params: { provider: 'zenvia' } })).status).toBe(401);
    process.env.MESSAGING_WEBHOOK_SECRET = 'tok-123';
    expect((await messagingWebhook(json('http://x/api/messaging/webhook/zenvia?token=errado', body), { params: { provider: 'zenvia' } })).status).toBe(401);
    expect((await messagingWebhook(json('http://x/api/messaging/webhook/zenvia?token=tok-123', body), { params: { provider: 'zenvia' } })).status).toBe(200);
  });

  it('a cashier cannot change the menu or the add-ons; the owner can', async () => {
    as(cashier.id, A.restaurantId);
    expect((await createMenuItem(json('http://x/api/cardapio/itens', { name: 'X', price: 1 }))).status).toBe(403);
    expect((await createModifier(json('http://x/api/modifiers', { name: 'Borda', priceAdjustment: 5 }))).status).toBe(403);
    expect(await prisma.itemModifier.count({ where: { restaurantId: A.restaurantId, name: 'Borda' } })).toBe(0);

    as(A.ownerId, A.restaurantId);
    const res = await createModifier(json('http://x/api/modifiers', { name: 'Borda', priceAdjustment: 5 }));
    expect([401, 403]).not.toContain(res.status);
  });

  it('a public reservation does not return the stored guest profile', async () => {
    const email = `cliente-${tag}@sweep.test`;
    await prisma.guestProfile.create({ data: { restaurantId: A.restaurantId, name: 'Cliente Real', email, phone: '+5511988887777' } });
    const res = await createReservation(json('http://x/api/reservations', {
      restaurantId: A.restaurantId, guestName: 'Outra pessoa', guestEmail: email, partySize: 2,
      reservedAt: new Date(Date.now() + 86400000).toISOString(),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.guest).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('+5511988887777');
  });
});
