// @ts-nocheck
/**
 * Stand-alone NFC-e typed on /admin/fiscal (POST /api/admin/fiscal/documents).
 * It used to declare every item as NCM 21069090 / CFOP 5102 whatever was sold, mark the note
 * "authorized" with a made-up access key in homologation and never send anything in production.
 * Each case states the DESIRED behaviour: real fiscal data (product, else restaurant defaults),
 * nothing guessed (missing data = 422 and no number used), the note really goes to the provider and
 * its answer is stored as-is, input is validated, only a manager of the restaurant can issue, and
 * another restaurant's product is never used.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as issue } from '../../../app/api/admin/fiscal/documents/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('stand-alone NFC-e on /admin/fiscal', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let config: any;
  let beer: any;
  let otherRestaurantRecipe: any;
  let cashier: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const users: string[] = [];

  const DEFAULTS = { defaultNcm: '21069090', defaultCfop: '5102', defaultOrigin: '0', defaultCsosn: '102', crt: '1' };
  const asUser = (id: string, restaurantId = A.restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id, email: `${id}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const post = async (body: any) => {
    const res = await issue(new Request('http://localhost/api/admin/fiscal/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as any);
    return { status: res.status, body: await res.json() };
  };
  const item = (extra: any = {}) => ({ description: 'Bolo de pote', quantity: 2, unitPrice: 12.5, ...extra });
  const docsOfA = () => prisma.nFeDocument.findMany({ where: { configId: config.id }, include: { items: { orderBy: { position: 'asc' } } } });
  const sent = () => fakeProvider.emitNFCe.mock.calls[0][0];

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    config = await prisma.nFeConfig.create({
      data: { restaurantId: A.restaurantId, cnpj: `6${Date.now()}`.slice(0, 14), nfeApiKey: 'k', environment: 'sandbox', ...DEFAULTS },
    });
    const mk = (restaurantId: string, name: string) =>
      prisma.recipe.create({ data: { restaurantId, code: `R-${crypto.randomBytes(3).toString('hex')}`, name: `${name} ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 12 } });
    beer = await mk(A.restaurantId, 'Cerveja');
    await prisma.recipe.update({ where: { id: beer.id }, data: { fiscalNcm: '22030000', fiscalCfop: '5405', fiscalCsosn: '500', fiscalCest: '0302100', fiscalOrigin: '0' } });
    otherRestaurantRecipe = await mk(B.restaurantId, 'Produto de B');
    cashier = await prisma.user.create({ data: { email: `cx-${tag}@avulsa.test`, name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: A.restaurantId, active: true } });
    users.push(cashier.id);
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: cashier.id, role: 'CASHIER', isActive: true } });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId: config.id }, { document: { configId: config.id } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId: config.id } });
    await prisma.nFeConfig.deleteMany({ where: { id: config.id } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(fakeProvider).forEach((fn) => typeof fn === 'function' && fn.mockReset());
    let calls = 0;
    fakeProvider.emitNFCe.mockImplementation(async () => ({ ok: true, status: 'authorized', accessKey: `35${String(++calls).padStart(42, '1')}`, protocolNumber: 'P1' }));
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId: config.id }, { document: { configId: config.id } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId: config.id } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.nFeConfig.update({ where: { id: config.id }, data: { ...DEFAULTS, nextNumberNFCe: 1, active: true } });
    asUser(A.ownerId);
  });

  it('sends the note to the provider with the restaurant defaults and stores its answer', async () => {
    const { status, body } = await post({ items: [item()], paymentMethod: 'pix', customerCPF: '123.456.789-09' });

    expect(status).toBe(201);
    expect(body).toMatchObject({ success: true, status: 'authorized' });
    expect(fakeProvider.emitNFCe).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ documentType: 'NFCe', number: 1, totalAmount: 25, paymentMethod: 'pix', customerCPF: '12345678909' });
    expect(sent().items[0]).toMatchObject({ ncm: '21069090', cfop: '5102', icmsOrigin: '0', icmsCST: '102', quantity: 2, unitPrice: 12.5, totalPrice: 25 });
    const [doc] = await docsOfA();
    expect(doc).toMatchObject({ status: 'authorized', accessKey: `35${'1'.repeat(41)}1`, documentNumber: 1 });
    expect(Number(doc.totalAmount)).toBe(25);
  });

  it("uses the chosen product's own fiscal data (substitution-tax beer with CEST)", async () => {
    await post({ items: [item(), item({ description: 'Cerveja', quantity: 1, unitPrice: 12, recipeId: beer.id })] });

    expect(sent().items[1]).toMatchObject({ ncm: '22030000', cfop: '5405', icmsCST: '500', cest: '0302100' });
    expect(sent().totalAmount).toBe(37);
  });

  it('never fakes an authorization: a rejection is stored as rejected, with its reason and an alert', async () => {
    fakeProvider.emitNFCe.mockResolvedValue({ ok: false, status: 'rejected', rejectionReason: 'Rejeição 778: NCM inexistente' });

    const { status, body } = await post({ items: [item()] });

    expect(status).toBe(201);
    expect(body).toMatchObject({ success: false, status: 'rejected', rejectionReason: 'Rejeição 778: NCM inexistente' });
    const [doc] = await docsOfA();
    expect(doc.status).toBe('rejected');
    expect(doc.accessKey).toBeNull();
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
  });

  it('refuses without fiscal data (no guessing) and uses no number', async () => {
    await prisma.nFeConfig.update({ where: { id: config.id }, data: { defaultNcm: null } });

    const { status, body } = await post({ items: [item()] });

    expect(status).toBe(422);
    expect(body.code).toBe('FISCAL_DATA_MISSING');
    expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
    expect(await docsOfA()).toHaveLength(0);
    expect((await prisma.nFeConfig.findUnique({ where: { id: config.id } })).nextNumberNFCe).toBe(1);
  });

  it("never uses another restaurant's product", async () => {
    const { status } = await post({ items: [item({ recipeId: otherRestaurantRecipe.id })] });

    expect(status).toBe(400);
    expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
  });

  it.each([
    ['no items', { items: [] }],
    ['empty description', { items: [item({ description: '  ' })] }],
    ['zero price', { items: [item({ unitPrice: 0 })] }],
    ['negative quantity', { items: [item({ quantity: -1 })] }],
    ['unknown payment method', { items: [item()], paymentMethod: 'cheque' }],
    ['a CNPJ as buyer', { items: [item()], customerCPF: '12.345.678/0001-90' }],
    ['an NF-e', { documentType: 'NFe', items: [item()] }],
  ])('refuses %s before reserving a number', async (_label, body) => {
    const { status } = await post(body);

    expect(status).toBe(400);
    expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
    expect(await docsOfA()).toHaveLength(0);
  });

  it('a cashier cannot issue a note', async () => {
    asUser(cashier.id);

    const { status } = await post({ items: [item()] });

    expect(status).toBe(401);
    expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
  });

  it('two notes in a row get consecutive numbers', async () => {
    await post({ items: [item()] });
    await post({ items: [item()] });

    expect((await docsOfA()).map((d) => d.documentNumber).sort()).toEqual([1, 2]);
  });
});
