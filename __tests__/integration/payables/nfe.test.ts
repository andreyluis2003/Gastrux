// @ts-nocheck
/** Importing a purchase NF-e with boletos creates contas a pagar, once, on Business (spec 2026-10-18 contas a pagar §5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as IMPORT } from '../../../app/api/nfe/import-xml/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const KEY = `3526101234567800019955001${String(Date.now()).slice(-10)}12345678`.slice(0, 44);
const XML = `<nfeProc><NFe><infNFe Id="NFe${KEY}"><ide><nNF>777</nNF><dhEmi>2026-10-18T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>Frigorifico ${tag}</xNome></emit>
<det nItem="1"><prod><cProd>P1</cProd><xProd>Picanha</xProd><uCom>kg</uCom><qCom>10</qCom><vUnCom>120.00</vUnCom><vProd>1200.00</vProd></prod></det>
<total><ICMSTot><vNF>1200.00</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-11-05</dVenc><vDup>400.00</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-05</dVenc><vDup>400.00</vDup></dup><dup><nDup>003</nDup><dVenc>2027-01-05</dVenc><vDup>400.00</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

describe('NF-e duplicatas become contas a pagar', () => {
  let b, p;
  const as = (x) => {
    const s = { user: { id: x.ownerId, email: x.email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const imp = (body) => IMPORT(new NextRequest('http://x/api/nfe/import-xml', { method: 'POST', body: JSON.stringify(body) }));
  const setup = async (tier) => {
    const email = `pnfe-${tier}-${tag}@gastrux.test`;
    const o = await prisma.user.create({ data: { email, name: 'Dona', password: 'x', role: 'OWNER' } });
    const rid = (await prisma.restaurant.create({ data: { name: `PNFE ${tier} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    return { rid, ownerId: o.id, email };
  };

  beforeAll(async () => {
    b = await setup('business');
    p = await setup('pro');
    await prisma.supplier.create({ data: { restaurantId: b.rid, code: `F${tag}`, name: `Frigorifico ${tag}`, cnpj: '12.345.678/0001-99' } });
  }, 60000);

  afterAll(async () => {
    for (const x of [b, p]) {
      try { await prisma.payable.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.invoice.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.supplier.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.delete({ where: { id: x.ownerId } }); } catch {}
    }
  });

  it('Business: three boletos become three merchandise bills, with the supplier found by CNPJ', async () => {
    as(b);
    const res = await imp({ xmlContent: XML });
    expect(res.status).toBe(200);
    expect((await res.json()).payables).toEqual({ created: 3, skipped: 0 });
    const rows = await prisma.payable.findMany({ where: { restaurantId: b.rid }, orderBy: { dueDate: 'asc' } });
    expect(rows.map((r) => [r.dueDate.toISOString().slice(0, 10), r.amountCents, r.category, r.source, r.nfeDupNumber])).toEqual([
      ['2026-11-05', 40000, 'MERCHANDISE', 'NFE', '001'],
      ['2026-12-05', 40000, 'MERCHANDISE', 'NFE', '002'],
      ['2027-01-05', 40000, 'MERCHANDISE', 'NFE', '003'],
    ]);
    expect(rows[0].description).toBe(`NF 777 - Frigorifico ${tag} 001`);
    expect(rows[0].supplierId).not.toBeNull();
  });

  it('importing the same note again creates no second bill', async () => {
    as(b);
    expect((await (await imp({ xmlContent: XML })).json()).payables).toEqual({ created: 0, skipped: 3 });
    expect(await prisma.payable.count({ where: { restaurantId: b.rid } })).toBe(3);
  });

  it('launchPayables false: no bills', async () => {
    as(b);
    await prisma.payable.deleteMany({ where: { restaurantId: b.rid } });
    const out = await (await imp({ xmlContent: XML, launchPayables: false })).json();
    expect(out.payables).toBeUndefined();
    expect(await prisma.payable.count({ where: { restaurantId: b.rid } })).toBe(0);
  });

  it('cashier: 403, no bills (final review I-5)', async () => {
    const c = await prisma.user.create({ data: { email: 'pnfe-c-' + tag + '@gastrux.test', name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: b.rid } });
    try {
      await prisma.restaurantUser.create({ data: { restaurantId: b.rid, userId: c.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
      await prisma.payable.deleteMany({ where: { restaurantId: b.rid } });
      as({ ownerId: c.id, email: c.email });
      expect((await imp({ xmlContent: XML })).status).toBe(403);
      expect(await prisma.payable.count({ where: { restaurantId: b.rid } })).toBe(0);
    } finally {
      await prisma.restaurantUser.deleteMany({ where: { userId: c.id } });
      await prisma.user.delete({ where: { id: c.id } });
    }
  });

  it('Pro: refused (Business), no bills', async () => {
    as(p);
    expect((await (await imp({ xmlContent: XML })).json()).payables).toEqual({ refused: 'business' });
    expect(await prisma.payable.count({ where: { restaurantId: p.rid } })).toBe(0);
  });
});
