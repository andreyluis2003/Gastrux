// @ts-nocheck
/** The data of the "Painel do dia" (2026-10-18 UX research, proposal 1): today in Brasília, this restaurant only */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { todayData } from '../../../lib/dashboard/today';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const NOW = new Date('2026-10-18T18:00:00Z'); // 15h in Brasília
const d = (s) => new Date(`${s}T00:00:00.000Z`);

describe('painel do dia data', () => {
  let ownerId, rid, other;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `tp-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `TP ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: true } })).id;
    other = (await prisma.restaurant.create({ data: { name: `TP2 ${tag}`, ownerId, status: 'ACTIVE', isInternal: true } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa principal', isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN', openedAt: NOW } });
    const sale = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', closedAt: NOW } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, createdById: ownerId, type: 'RECEIPT', method: 'CASH', amountCents: 4550, orderSessionId: sale.id, createdAt: NOW } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN', tableNumber: 7 } });
    const balcao = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'SENT_TO_KITCHEN', customerName: 'Balcão Ana' } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `TP-${tag}-1`, status: 'PENDING', orderType: 'DINE_IN', orderSessionId: balcao.id } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `TP-${tag}-2`, status: 'COMPLETED', orderType: 'DINE_IN', orderSessionId: balcao.id } });
    await prisma.payable.create({ data: { restaurantId: rid, description: 'Aluguel', category: 'RENT', amountCents: 100000, competenceMonth: d('2026-10-01'), dueDate: d('2026-10-18'), createdById: ownerId } });
    await prisma.payable.create({ data: { restaurantId: rid, description: 'Gás', category: 'OTHER', amountCents: 20000, competenceMonth: d('2026-10-01'), dueDate: d('2026-10-10'), createdById: ownerId } });
    await prisma.payable.create({ data: { restaurantId: rid, description: 'Depois', category: 'OTHER', amountCents: 9900, competenceMonth: d('2026-10-01'), dueDate: d('2026-10-25'), createdById: ownerId } });
    // Another restaurant's day never shows up
    await prisma.orderSession.create({ data: { restaurantId: other, userId: ownerId, status: 'OPEN', tableNumber: 9 } });
  }, 60000);
  afterAll(async () => {
    try { await prisma.payable.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.order.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    try { await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.orderSession.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    try { await prisma.cashSession.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, other] } } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('sales, register, comandas, kitchen queue and bills of today', async () => {
    const t = await todayData(rid, NOW);
    expect(t).toMatchObject({
      salesCents: 4550, salesCount: 1,
      openShifts: [{ registerName: 'Caixa principal' }],
      openTables: 1, openComandas: 2,
      deliveryPending: 0,
      kitchenQueue: 1,
      payables: { overdue: { count: 1, cents: 20000 }, today: { count: 1, cents: 100000 } },
      lowStock: 0,
    });
  });
});
