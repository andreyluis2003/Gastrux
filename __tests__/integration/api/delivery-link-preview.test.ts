// @ts-nocheck
/**
 * The delivery menu link sent on WhatsApp previews the restaurant, not Gastrux (2026-10-18, WhatsApp option A):
 * name, "Cardápio e pedidos online" and the restaurant logo when there is one.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { generateMetadata } from '../../../app/delivery/[restaurantId]/layout';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('delivery link preview', () => {
  let ownerId, withLogo, noLogo;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `dlp-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    withLogo = (await prisma.restaurant.create({ data: { name: `Espetaria ${tag}`, ownerId, status: 'ACTIVE', logoUrl: 'https://cdn.example.com/logo.png' } })).id;
    noLogo = (await prisma.restaurant.create({ data: { name: `Bar ${tag}`, ownerId, status: 'ACTIVE', logoUrl: '/uploads/bar.png' } })).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [withLogo, noLogo] } } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('name, menu text and the restaurant logo', async () => {
    const m = await generateMetadata({ params: { restaurantId: withLogo } });
    expect(m.title).toBe(`Espetaria ${tag} | Cardápio e pedidos online`);
    expect(m.description).toBe(`Veja o cardápio do Espetaria ${tag} e faça seu pedido online.`);
    expect(m.openGraph.title).toBe(`Espetaria ${tag}`);
    expect(m.openGraph.description).toBe('Cardápio e pedidos online');
    expect(m.openGraph.images).toEqual([{ url: 'https://cdn.example.com/logo.png' }]);
  });

  it('a logo path on the site becomes an absolute address (WhatsApp needs it)', async () => {
    const m = await generateMetadata({ params: { restaurantId: noLogo } });
    expect(m.openGraph.images[0].url).toMatch(/^https?:\/\/[^/]+\/uploads\/bar\.png$/);
  });

  it('an unknown restaurant: a neutral menu title, never another restaurant', async () => {
    const m = await generateMetadata({ params: { restaurantId: 'nao-existe' } });
    expect(m.title).toBe('Cardápio e pedidos online');
    expect(m.openGraph.images).toBeUndefined();
  });
});
