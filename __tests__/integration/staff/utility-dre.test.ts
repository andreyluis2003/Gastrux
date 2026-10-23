// @ts-nocheck
/** The DRE line "Contas de consumo" by reference month (spec 2026-10-16, 4.6) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as DRE } from '../../../app/api/financeiro/dre/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('DRE: contas de consumo', () => {
  let rid, owner, otherRid;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `udre-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Udre ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Udre2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const energy = await prisma.utilityAccount.create({ data: { restaurantId: rid, kind: 'ENERGY', name: 'Energia' } });
    const rent = await prisma.utilityAccount.create({ data: { restaurantId: rid, kind: 'OTHER', name: 'Aluguel' } });
    const other = await prisma.utilityAccount.create({ data: { restaurantId: otherRid, kind: 'ENERGY', name: 'Energia' } });
    const bill = (account, restaurantId, ym, amountCents, createdAt = new Date()) =>
      prisma.utilityBill.create({ data: { accountId: account.id, restaurantId, referenceMonth: new Date(`${ym}-01T00:00:00Z`), amountCents, consumption: account.kind === 'ENERGY' ? 100 : null, createdById: o.id, createdAt } });
    await bill(energy, rid, '2026-09', 124000, new Date('2026-11-05T12:00:00Z')); // typed in November for September
    await bill(rent, rid, '2026-09', 300000);
    await bill(energy, rid, '2026-08', 110000);
    await bill(other, otherRid, '2026-09', 999900);
  });
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: owner.id } }); } catch {}
  });

  const dre = async (start, end) => {
    const s = { user: owner, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
    return (await DRE(new NextRequest(`http://x/api/financeiro/dre?startDate=${start}&endDate=${end}`))).json();
  };

  it('September shows the September bills, typed late or not; not August, not other restaurants', async () => {
    const body = await dre('2026-09-01', '2026-09-30');
    expect(body.dre.despesasOperacionais.contasConsumo).toBe(4240);
    expect(body.dre.contasConsumoNotaMesInteiro).toBe(false);
  });

  it('a period spanning August and September takes both; a partial month is flagged', async () => {
    expect((await dre('2026-08-01', '2026-09-30')).dre.despesasOperacionais.contasConsumo).toBe(5340);
    const partial = await dre('2026-09-10', '2026-09-20');
    expect(partial.dre.despesasOperacionais.contasConsumo).toBe(4240);
    expect(partial.dre.contasConsumoNotaMesInteiro).toBe(true);
  });

  it('the line enters the operating expenses total', async () => {
    const body = await dre('2026-09-01', '2026-09-30');
    const d = body.dre.despesasOperacionais;
    expect(d.total).toBeCloseTo(d.operacional + d.pessoal + d.taxasGateway + d.contasConsumo, 2);
  });
});
