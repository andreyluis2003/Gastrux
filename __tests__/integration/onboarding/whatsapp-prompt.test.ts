// @ts-nocheck
/** Accounts from before the sign-up asked for the WhatsApp fill it in once, after logging in. */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { GET, POST } from '../../../app/api/conta/whatsapp/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (id) => (getServerSession as jest.Mock).mockResolvedValue(id ? { user: { id } } : null);
const send = (body) => POST(new Request('http://x/api/conta/whatsapp', { method: 'POST', body: JSON.stringify(body) }) as any);

describe('WhatsApp prompt for older accounts', () => {
  let owner, staff, restaurant;
  const user = () => prisma.user.findUnique({ where: { id: owner } });

  beforeAll(async () => {
    owner = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    staff = (await prisma.user.create({ data: { email: `equipe-${tag}@gastrux.test`, name: 'Equipe', password: 'x', role: 'COOK' } })).id;
    restaurant = (await prisma.restaurant.create({ data: { name: `Antigo ${tag}`, ownerId: owner, status: 'TRIAL' } })).id;
    await prisma.user.updateMany({ where: { id: { in: [owner, staff] } }, data: { currentRestaurantId: restaurant } });
  });

  afterAll(async () => {
    await prisma.user.updateMany({ where: { id: { in: [owner, staff] } }, data: { currentRestaurantId: null } });
    await prisma.restaurant.delete({ where: { id: restaurant } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [owner, staff] } } });
  });

  it('asks only the owner, and nobody logged out', async () => {
    as(null);
    expect((await GET()).status).toBe(401);
    as(staff);
    expect(await (await GET()).json()).toEqual({ needed: false });
    expect((await send({ whatsapp: '66999998888' })).status).toBe(409);
    as(owner);
    expect(await (await GET()).json()).toEqual({ needed: true });
  });

  it('refuses an invalid number', async () => {
    as(owner);
    expect((await send({ whatsapp: '123' })).status).toBe(400);
    expect((await user()).whatsapp).toBeNull();
  });

  it('saves the number without consent when the box is unticked, then stops asking', async () => {
    as(owner);
    expect((await send({ whatsapp: '(66) 99999-8888' })).status).toBe(200);
    const u = await user();
    expect(u.whatsapp).toBe('5566999998888');
    expect(u.whatsappMarketingConsentAt).toBeNull();
    expect(await (await GET()).json()).toEqual({ needed: false });
  });

  it('a saved number is never overwritten here; the tick records the consent', async () => {
    as(owner);
    expect((await send({ whatsapp: '66911112222', whatsappMarketing: true })).status).toBe(409);
    expect((await user()).whatsapp).toBe('5566999998888');

    await prisma.user.update({ where: { id: owner }, data: { whatsapp: null } });
    expect((await send({ whatsapp: '66911112222', whatsappMarketing: true })).status).toBe(200);
    const u = await user();
    expect(u.whatsappMarketingConsentAt).not.toBeNull();
    expect(u.whatsappMarketingConsentVersion).toBeTruthy();
  });
});
