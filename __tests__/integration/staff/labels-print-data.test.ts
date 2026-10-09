// @ts-nocheck
/** What a printed label carries, and the label size setting (spec 2026-10-09 etiquetas, 5.2, 5.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as PRINT } from '../../../app/api/print/labels/route';
import { PATCH as SETTINGS } from '../../../app/api/admin/restaurant/settings/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('labels: print data and size', () => {
  let rid: string, ownerId: string, mine: string, theirs: string;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ld-${tag}@gastrux.test`, name: 'Ana Souza', password: 'x', role: 'OWNER' } });
    ownerId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Cantina ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const other = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const base = { itemType: 'RECIPE', itemName: 'Molho', storage: 'CHILLED', preparedAt: new Date(), expiresAt: new Date(Date.now() + 3 * 864e5), printedById: ownerId, quantity: 2, unit: 'kg' };
    mine = (await prisma.foodLabel.create({ data: { ...base, restaurantId: rid } })).id;
    theirs = (await prisma.foodLabel.create({ data: { ...base, restaurantId: other } })).id;
    const s = { user: { id: ownerId, email: o.email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { ownerId } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('returns only this restaurant labels, with storage in Portuguese, first name and the QR link', async () => {
    const body = await (await PRINT(new NextRequest(`http://x/api/print/labels?ids=${mine},${theirs}`))).json();
    expect(body.size).toBe('60x40');
    expect(body.restaurantName).toBe(`Cantina ${tag}`);
    expect(body.labels).toHaveLength(1);
    expect(body.labels[0]).toMatchObject({ id: mine, itemName: 'Molho', storageLabel: 'Refrigerado', printedBy: 'Ana', quantity: 2, unit: 'kg' });
    expect(body.labels[0].qrUrl).toMatch(new RegExp(`/etiquetas/${mine}$`));
  });

  it('the size is a restaurant setting: 60x40 or 40x25 only', async () => {
    const patch = (labelSize: string) => SETTINGS(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ labelSize }) }));
    expect((await patch('40x25')).status).toBe(200);
    expect((await (await PRINT(new NextRequest(`http://x/api/print/labels?ids=${mine}`))).json()).size).toBe('40x25');
    expect((await patch('100x50')).status).toBe(400);
  });
});
