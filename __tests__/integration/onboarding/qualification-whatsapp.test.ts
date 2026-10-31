// @ts-nocheck
/**
 * The WhatsApp became required in the sign-up questions (activation agent, 2026-10-28): it is how
 * the Equipe Gastrux helps during the trial. Asked on both buttons, "Continuar" and "Pular por enquanto".
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { POST as signup } from '../../../app/api/signup/route';
import { POST as qualify } from '../../../app/api/onboarding/qualification/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

async function newAccount() {
  const email = `qual-wa-${crypto.randomBytes(4).toString('hex')}@gastrux.test`;
  const res = await signup(new Request('http://x/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Teste#12345', name: 'Qual WhatsApp', acceptedTerms: true }),
  }) as any);
  expect(res.status).toBe(201);
  const body = await res.json();
  return { userId: body.user.id, restaurantId: body.restaurant.id };
}

function answer(userId: string, payload: any) {
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId } });
  return qualify(new Request('http://x/api/onboarding/qualification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any);
}

describe('sign-up questions: WhatsApp required', () => {
  it('marketing by WhatsApp needs its own tick, and an untick withdraws it', async () => {
    const a = await newAccount();
    await answer(a.userId, { skip: true, whatsapp: '(66) 99999-8888' });
    let user = await prisma.user.findUnique({ where: { id: a.userId } });
    expect(user.whatsapp).toBe('5566999998888');
    expect(user.whatsappMarketingConsentAt).toBeNull();

    await answer(a.userId, { skip: true, whatsapp: '(66) 99999-8888', whatsappMarketing: 'true' });
    expect((await prisma.user.findUnique({ where: { id: a.userId } })).whatsappMarketingConsentAt).toBeNull();

    await answer(a.userId, { skip: true, whatsapp: '(66) 99999-8888', whatsappMarketing: true });
    user = await prisma.user.findUnique({ where: { id: a.userId } });
    expect(user.whatsappMarketingConsentAt).toBeInstanceOf(Date);
    expect(user.whatsappMarketingConsentVersion).toBe('2026-10-31');

    await answer(a.userId, { skip: true, whatsapp: '(66) 99999-8888', whatsappMarketing: false });
    expect((await prisma.user.findUnique({ where: { id: a.userId } })).whatsappMarketingConsentAt).toBeNull();
  });

  const made: Array<{ userId: string; restaurantId: string }> = [];

  beforeAll(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterAll(async () => {
    for (const a of made) {
      try {
        await prisma.restaurant.delete({ where: { id: a.restaurantId } });
        await prisma.user.delete({ where: { id: a.userId } });
      } catch {
        // Left in the local test database under a unique e-mail
      }
    }
  });

  it.each([
    ['Continuar', { businessType: 'pizzaria', startWith: 'blank' }],
    ['Pular', { skip: true }],
  ])('%s without a WhatsApp is refused', async (_label, payload) => {
    const a = await newAccount(); made.push(a);
    const res = await answer(a.userId, payload);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Informe o WhatsApp com DDD');
    expect((await prisma.user.findUnique({ where: { id: a.userId } })).whatsapp).toBeNull();
  });

  it.each([
    ['Continuar', { businessType: 'pizzaria', startWith: 'blank' }],
    ['Pular', { skip: true }],
  ])('%s with a WhatsApp saves it as digits with 55', async (_label, payload) => {
    const a = await newAccount(); made.push(a);
    const res = await answer(a.userId, { ...payload, whatsapp: '(66) 99999-8888' });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: a.userId } })).whatsapp).toBe('5566999998888');
  });
});
