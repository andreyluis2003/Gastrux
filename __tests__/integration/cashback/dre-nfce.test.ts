// @ts-nocheck
/** Cashback in the DRE and the NFC-e (spec 2026-10-23 §8) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const fakeProvider = { name: 'fake', emitNFCe: jest.fn(), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));
import { computeDre } from '../../../lib/finance/dre';
import { salesInRange } from '../../../lib/finance/month-sales';
import { emitNFCeForSession } from '../../../lib/nfe/emit-session';
import { FocusNFeClient } from '../../../lib/nfe/focus-nfe-client';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const AT = new Date('2026-09-10T22:00:00Z');

describe('cashback in the DRE and the NFC-e', () => {
  let rid, ownerId, sid, configId;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `cbd-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `D ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId } });
    const a = await prisma.recipe.create({ data: { restaurantId: rid, code: `A${tag}`, name: 'Espeto', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    const b = await prisma.recipe.create({ data: { restaurantId: rid, code: `B${tag}`, name: 'Picanha', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 40 } });
    // R$ 50,00 of items, R$ 20,00 of cashback used, R$ 30,00 paid
    sid = (await prisma.orderSession.create({
      data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', closedAt: AT, cashbackUsedCents: 2000,
        items: { create: [{ recipeId: a.id, quantity: 1, price: 10, addedAt: AT }, { recipeId: b.id, quantity: 1, price: 40, addedAt: AT }] } },
    })).id;
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, createdById: ownerId, type: 'RECEIPT', method: 'PIX', amountCents: 3000, orderSessionId: sid, createdAt: AT } });
    configId = (await prisma.nFeConfig.create({
      data: { restaurantId: rid, cnpj: `7${Date.now()}`.slice(0, 14), nfeApiKey: 'k', environment: 'sandbox', defaultNcm: '21069090', defaultCfop: '5102', defaultOrigin: '0', defaultCsosn: '102', crt: '1' },
    })).id;
    fakeProvider.emitNFCe.mockImplementation(async () => ({ ok: true, status: 'authorized', accessKey: '3'.repeat(44) }));
  }, 60000);

  afterAll(async () => {
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId }, { document: { configId } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId } });
    await prisma.nFeConfig.deleteMany({ where: { id: configId } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('DRE: gross revenue with the cashback, the cashback as a deduction, net = what came in', async () => {
    const { dre } = await computeDre(rid, '2026-09-01', '2026-09-30');
    expect(dre.receitaBruta).toBeCloseTo(50, 2);
    expect(dre.deducoes.cashback).toBeCloseTo(20, 2);
    expect(dre.receitaLiquida).toBeCloseTo(30, 2);
    expect((await salesInRange(rid, new Date('2026-09-01T03:00:00Z'), new Date('2026-10-01T03:00:00Z'))).totalCents).toBe(3000);
  });

  it('NFC-e: the discount spread over the items, the payment is what was paid', async () => {
    const out = await emitNFCeForSession({ restaurantId: rid, orderSessionId: sid, paymentMethod: 'pix' });
    expect(out.httpStatus).toBeLessThan(300);
    const payload = fakeProvider.emitNFCe.mock.calls[0][0];
    expect(payload.items.map((i) => i.discount)).toEqual([4, 16]);
    expect(payload.totalAmount).toBeCloseTo(30, 2);
    expect(payload.paymentAmount).toBeCloseTo(30, 2);
    const focus = (new FocusNFeClient('k', 'production') as any).buildNFCePayload(payload);
    expect(focus.items.map((i) => i.valor_desconto)).toEqual(['4.00', '16.00']);
    expect(focus.formas_pagamento[0].valor_pagamento).toBe('30.00');
  });
});
