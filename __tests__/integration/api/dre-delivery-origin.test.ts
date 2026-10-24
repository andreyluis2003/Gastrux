// @ts-nocheck
/** Delivery sales by origin in the DRE (plan 2026-10-23 api-de-pedidos, Task 8) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { salesInRange } from '../../../lib/finance/month-sales';
import { computeDre } from '../../../lib/finance/dre';
import { ingestDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { parseOrderApiInput } from '../../../lib/delivery-orders/input';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('delivery by origin', () => {
  let rid, ownerId;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `ddo-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Ddo ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false } })).id;
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Marmita de frango', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 20 } });
    // A site order (no external order, as before 2026-10-23): R$ 30
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `DLV-${tag}`, orderType: 'DELIVERY', status: 'PENDING', subtotal: 25, fees: 5, total: 30, items: { create: [{ recipeId: recipe.id, quantity: 1 }] } } });
    // An order of the Gastrux order API: R$ 47
    const integrationId = (await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'gastrux_api', apiKey: 'x', webhookSecret: 'y' } })).id;
    const r = parseOrderApiInput({ codigo: `API-${tag}`, cliente: { nome: 'Ana', celular: '(11) 95555-4444' }, retirada: true, itens: [{ nome: 'Marmita de frango', quantidade: 2, precoUnitario: 23.5 }], total: 47, pagamento: { forma: 'PIX', pago: true } });
    if (!r.ok) throw new Error(r.error);
    await ingestDeliveryOrder({ restaurantId: rid, integrationId, platform: 'gastrux_api', input: r.value });
  }, 60000);
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId: rid } });
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.delete({ where: { id: ownerId } });
  });

  it('salesInRange splits delivery into site and API; the DRE shows both lines', async () => {
    const from = new Date(Date.now() - 3600e3), to = new Date(Date.now() + 3600e3);
    const s = await salesInRange(rid, from, to);
    expect(s.deliveryCents).toBe(7700);
    expect(s.deliveryByOrigin).toEqual({ site: 3000, gastrux_api: 4700 });
    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const dre = await computeDre(rid, today, today);
    expect(dre.dre.receitaDeliveryPorOrigem).toEqual({ site: 30, gastrux_api: 47 });
  });
});
