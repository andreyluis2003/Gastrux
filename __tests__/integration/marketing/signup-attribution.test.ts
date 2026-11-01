// @ts-nocheck
/** The origin of a sign-up: kept from the link's cookie, shown in the client's file, never blocks the sign-up. */
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { POST as signup } from '../../../app/api/signup/route';
import { clientProfiles } from '../../../lib/admin/client-profile';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const made: any[] = [];

async function create(cookie?: string) {
  const res = await signup(new NextRequest('http://x/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie: `gx_utm=${encodeURIComponent(cookie)}` } : {}) },
    body: JSON.stringify({ email: `origem-${crypto.randomBytes(4).toString('hex')}@gastrux.test`, password: 'Teste#12345', name: 'Origem', acceptedTerms: true }),
  }));
  expect(res.status).toBe(201);
  const body = await res.json();
  made.push(body);
  return body;
}

describe('sign-up origin', () => {
  afterAll(async () => {
    for (const b of made) {
      await prisma.restaurant.delete({ where: { id: b.restaurant.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: b.user.id } }).catch(() => {});
    }
  });

  it('keeps the link of the ad and shows it in the client file', async () => {
    const b = await create(JSON.stringify({ source: 'meta', medium: 'paid_social', campaign: 'sinop', content: 'video_a' }));
    const row = await prisma.signupAttribution.findUnique({ where: { restaurantId: b.restaurant.id } });
    expect(row.source).toBe('meta');
    const profile = (await clientProfiles([b.restaurant.id])).get(b.restaurant.id);
    expect(profile.answers).toContainEqual({ question: 'Origem do cadastro', answer: 'meta · paid_social · sinop · video_a' });
  });

  it('a sign-up without a link, or with a broken cookie, works and records nothing', async () => {
    const plain = await create();
    const broken = await create('{oops');
    expect(await prisma.signupAttribution.count({ where: { restaurantId: { in: [plain.restaurant.id, broken.restaurant.id] } } })).toBe(0);
  });
});
