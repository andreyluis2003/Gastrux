/**
 * Watched tutorial videos per user (spec 2026-10-25 tutoriais-em-video): the progress follows the person
 * on any device, one row per video.
 */
// @ts-nocheck
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/tutorials/progress/route';
import { TUTORIALS } from '../../lib/tutorials/catalog';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const caixa = TUTORIALS.find((t) => t.slug === 'caixa');

function post(slug: unknown) {
  return POST(new NextRequest('http://localhost/api/tutorials/progress', { method: 'POST', body: JSON.stringify({ slug }) }));
}

describe('tutorial progress', () => {
  let ana: any;
  let bruno: any;

  beforeAll(async () => {
    caixa.published = true;
    const tag = Date.now();
    ana = await prisma.user.create({ data: { email: `ana-tut-${tag}@test.local`, name: 'Ana' } });
    bruno = await prisma.user.create({ data: { email: `bruno-tut-${tag}@test.local`, name: 'Bruno' } });
  });

  afterAll(async () => {
    caixa.published = false;
    await prisma.tutorialView.deleteMany({ where: { userId: { in: [ana.id, bruno.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ana.id, bruno.id] } } });
  });

  const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);

  it('requires a session', async () => {
    as(null);
    expect((await GET()).status).toBe(401);
    expect((await post('caixa')).status).toBe(401);
  });

  it('rejects a video that is not in the catalog (or not published) and writes nothing', async () => {
    as(ana);
    expect((await post('nao-existe')).status).toBe(400);
    expect((await post('dre')).status).toBe(400);
    expect((await post(42)).status).toBe(400);
    expect(await prisma.tutorialView.count({ where: { userId: ana.id } })).toBe(0);
  });

  it('keeps one row per video and refreshes the date when watched again', async () => {
    as(ana);
    expect((await post('caixa')).status).toBe(200);
    const first = await prisma.tutorialView.findFirst({ where: { userId: ana.id, slug: 'caixa' } });
    await new Promise((r) => setTimeout(r, 20));
    expect((await post('caixa')).status).toBe(200);
    const rows = await prisma.tutorialView.findMany({ where: { userId: ana.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].watchedAt.getTime()).toBeGreaterThan(first.watchedAt.getTime());
  });

  it('lists only the videos of the person asking', async () => {
    as(ana);
    expect(await (await GET()).json()).toEqual({ watched: ['caixa'] });
    as(bruno);
    expect(await (await GET()).json()).toEqual({ watched: [] });
  });
});
