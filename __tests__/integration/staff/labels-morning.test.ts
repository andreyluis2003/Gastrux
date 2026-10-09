// @ts-nocheck
/** Morning alert of expired / expiring labels (spec 2026-10-09 etiquetas, 6) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { alertExpiringLabels } from '../../../lib/labels/morning-alert';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('labels: morning alert', () => {
  let pro: string, starter: string, userId: string;
  const alerts = (rid: string) => prisma.notification.findMany({ where: { restaurantId: rid, data: { path: ['kind'], equals: 'label_expiry' } } });
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `lm-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    pro = (await prisma.restaurant.create({ data: { name: `Lm ${tag}`, ownerId: userId, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    starter = (await prisma.restaurant.create({ data: { name: `Lm2 ${tag}`, ownerId: userId, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    const now = Date.now();
    for (const rid of [pro, starter]) {
      await prisma.foodLabel.createMany({ data: [
        { restaurantId: rid, itemType: 'INGREDIENT', itemName: 'Leite', storage: 'CHILLED', preparedAt: new Date(now - 4 * 864e5), expiresAt: new Date(now - 3600e3), printedById: userId },
        { restaurantId: rid, itemType: 'INGREDIENT', itemName: 'Creme', storage: 'CHILLED', preparedAt: new Date(now - 864e5), expiresAt: new Date(now + 60e3), printedById: userId },
      ] });
    }
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [pro, starter] } } }); } catch {}
    try { await prisma.user.delete({ where: { id: userId } }); } catch {}
  });

  it('one restaurant-wide alert per day, only for Pro and up', async () => {
    await alertExpiringLabels();
    await alertExpiringLabels();
    const a = await alerts(pro);
    expect(a).toHaveLength(1);
    expect(a[0].userId).toBeNull();
    expect(a[0].title).toMatch(/1 etiqueta vencida/);
    expect(a[0].actionUrl).toBe('/etiquetas/validades');
    expect(await alerts(starter)).toHaveLength(0);
  });
});
