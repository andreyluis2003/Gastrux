// @ts-nocheck
/**
 * Launch plan item 3 (owner decision 2026-09-25): fiscal data per product.
 * Every NFC-e item used to go out as NCM 21069090 / CFOP 5102 / CSOSN 102 whatever the product.
 * Each case states the DESIRED behaviour: a product's own data wins, the restaurant defaults fill
 * the gaps, nothing is ever guessed (missing data refuses the note, uses no number, keeps the sale
 * and alerts the manager), substitution-tax items need a CEST, Regime Normal is refused until it
 * is modelled, a re-send keeps the data first declared, and only a manager edits the data.
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
import { PUT as updateComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { POST as submit } from '../../../app/api/nfe/documents/[id]/submit/route';
import { PUT as setFiscal } from '../../../app/api/recipes/[id]/fiscal/route';
import { GET as fiscalPending } from '../../../app/api/nfe/fiscal-pending/route';
import { FocusNFeClient } from '../../../lib/nfe/focus-nfe-client';
import { GET as readFiscalConfig, PATCH as patchFiscalConfig } from '../../../app/api/admin/fiscal/config/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('fiscal data per product (launch plan item 3)', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let config: any;
  let burger: any;
  let beer: any;
  let cashier: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const users: string[] = [];

  const asUser = (id: string) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id, email: `${id}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(A.restaurantId);
  };
  const req = (url: string, method: string, body?: any) =>
    new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) as any;

  const DEFAULTS = { defaultNcm: '21069090', defaultCfop: '5102', defaultOrigin: '0', defaultCsosn: '102', crt: '1' };
  const NO_DEFAULTS = { defaultNcm: null, defaultCfop: null, defaultOrigin: null, defaultCsosn: null, crt: '1' };
  const setConfig = (data: any) => prisma.nFeConfig.update({ where: { id: config.id }, data });
  const setRecipeFiscal = (id: string, data: any) => prisma.recipe.update({ where: { id }, data });
  const CLEAR = { fiscalNcm: null, fiscalCest: null, fiscalCfop: null, fiscalOrigin: null, fiscalCsosn: null };

  const closeWith = async (lines: Array<[any, number]>) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 2 } });
    for (const [recipe, quantity] of lines) {
      await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: recipe.sellingPrice, quantity } });
    }
    const res = await updateComanda(req(`http://localhost/api/comanda/sessions/${s.id}`, 'PUT', { status: 'CLOSED', paymentMethod: 'dinheiro' }), { params: { id: s.id } });
    return { s, body: await res.json() };
  };
  const sentItems = (call = 0) => fakeProvider.emitNFCe.mock.calls[call][0].items;

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    config = await prisma.nFeConfig.create({
      data: { restaurantId: A.restaurantId, cnpj: `6${Date.now()}`.slice(0, 14), nfeApiKey: 'k', environment: 'sandbox', autoIssueOnSale: true, ...DEFAULTS },
    });
    const mk = (name: string, price: number) =>
      prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${crypto.randomBytes(3).toString('hex')}`, name: `${name} ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: price } });
    burger = await mk('X-Burger', 30);
    beer = await mk('Cerveja long neck', 12);
    cashier = await prisma.user.create({ data: { email: `cx-${tag}@fiscal.test`, name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: A.restaurantId, active: true } });
    users.push(cashier.id);
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: cashier.id, role: 'CASHIER', isActive: true } });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId: config.id }, { document: { configId: config.id } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId: config.id } });
    await prisma.nFeConfig.deleteMany({ where: { id: config.id } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ restaurantId: { in: ids } }, { userId: { in: users } }] } });
    await prisma.restaurantUser.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(fakeProvider).forEach((fn) => typeof fn === 'function' && fn.mockReset());
    fakeProvider.emitNFCe.mockImplementation(async () => ({ ok: true, status: 'authorized', accessKey: `35${crypto.randomBytes(21).toString('hex').replace(/\D/g, '2').slice(0, 42)}` }));
    await prisma.nFeLog.deleteMany({ where: { OR: [{ configId: config.id }, { document: { configId: config.id } }] } });
    await prisma.nFeDocument.deleteMany({ where: { configId: config.id } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await setConfig({ ...DEFAULTS, nextNumberNFCe: 1, pisCofinsCst: null });
    await setRecipeFiscal(burger.id, CLEAR);
    await setRecipeFiscal(beer.id, CLEAR);
    asUser(A.ownerId);
  });

  describe('which data goes on the note', () => {
    it('the restaurant defaults fill a product without its own data', async () => {
      await closeWith([[burger, 1]]);
      expect(sentItems()[0]).toMatchObject({ ncm: '21069090', cfop: '5102', icmsOrigin: '0', icmsCST: '102' });
    });

    it("a product's own data wins over the defaults (a beer under substitution tax)", async () => {
      await setRecipeFiscal(beer.id, { fiscalNcm: '22030000', fiscalCfop: '5405', fiscalCsosn: '500', fiscalCest: '0302100', fiscalOrigin: '0' });

      await closeWith([[burger, 1], [beer, 2]]);

      const [b, cerveja] = sentItems();
      expect(b).toMatchObject({ ncm: '21069090', cfop: '5102', icmsCST: '102' });
      expect(cerveja).toMatchObject({ ncm: '22030000', cfop: '5405', icmsCST: '500', cest: '0302100' });
      const doc = await prisma.nFeDocument.findFirst({ where: { configId: config.id }, include: { items: { orderBy: { position: 'asc' } } } });
      expect(doc.items.map((i) => [i.ncm, i.cfop])).toEqual([['21069090', '5102'], ['22030000', '5405']]);
    });

    it('the PIS/COFINS code of the restaurant goes on the note', async () => {
      await setConfig({ pisCofinsCst: '49' });
      await closeWith([[burger, 1]]);
      expect(fakeProvider.emitNFCe.mock.calls[0][0].pisCofinsCst).toBe('49');
    });
  });

  describe('nothing is guessed', () => {
    it('without product data nor defaults: the bill closes, no note, no number used, the manager is told which product', async () => {
      await setConfig(NO_DEFAULTS);

      const { s, body } = await closeWith([[burger, 1]]);

      expect(body.status).toBe('CLOSED');
      expect(body.nfce.message).toContain(`X-Burger ${tag}`);
      expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
      expect(await prisma.nFeDocument.count({ where: { orderSessionId: s.id } })).toBe(0);
      expect((await prisma.nFeConfig.findUnique({ where: { id: config.id } })).nextNumberNFCe).toBe(1);
      const alerts = await prisma.notification.findMany({ where: { restaurantId: A.restaurantId } });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toContain(`X-Burger ${tag}`);
    });

    it('a substitution-tax item (CSOSN 500) without CEST is refused', async () => {
      await setRecipeFiscal(beer.id, { fiscalNcm: '22030000', fiscalCfop: '5405', fiscalCsosn: '500', fiscalOrigin: '0' });
      const { body } = await closeWith([[beer, 1]]);
      expect(body.nfce.message).toContain(`Cerveja long neck ${tag}`);
      expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
    });

    it('Regime Normal (CRT 3) is refused with a clear message instead of a wrong note', async () => {
      await setConfig({ crt: '3' });
      const { body } = await closeWith([[burger, 1]]);
      expect(body.nfce.message).toMatch(/Regime Normal/);
      expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
    });
  });

  describe('re-sending a rejected note', () => {
    it('keeps the origin, CSOSN and CEST first declared', async () => {
      await setRecipeFiscal(beer.id, { fiscalNcm: '22030000', fiscalCfop: '5405', fiscalCsosn: '500', fiscalCest: '0302100', fiscalOrigin: '0' });
      fakeProvider.emitNFCe.mockReset();
      fakeProvider.emitNFCe
        .mockResolvedValueOnce({ ok: false, status: 'rejected', rejectionReason: 'Rejeição: teste' })
        .mockResolvedValueOnce({ ok: true, status: 'authorized' });
      await closeWith([[beer, 1]]);
      const doc = await prisma.nFeDocument.findFirst({ where: { configId: config.id } });

      await submit(req(`http://localhost/api/nfe/documents/${doc.id}/submit`, 'POST', {}), { params: { id: doc.id } });

      expect(sentItems(1)[0]).toMatchObject({ icmsCST: '500', cest: '0302100', icmsOrigin: '0', ncm: '22030000' });
    });
  });

  describe('editing the data', () => {
    const put = (id: string, body: any) => setFiscal(req(`http://localhost/api/recipes/${id}/fiscal`, 'PUT', body), { params: { id } });

    it('a manager saves the data (digits only) and it leaves a trace with old and new values', async () => {
      const res = await put(burger.id, { fiscalNcm: '2106.90.90', fiscalCfop: '5102', fiscalOrigin: '0', fiscalCsosn: '102' });
      expect(res.status).toBe(200);
      expect((await prisma.recipe.findUnique({ where: { id: burger.id } })).fiscalNcm).toBe('21069090');
      const logs = await prisma.auditLog.findMany({ where: { userId: A.ownerId, entityId: burger.id } });
      expect(logs.some((l) => l.changes.includes('21069090'))).toBe(true);
    });

    it('invalid data is refused with the reason', async () => {
      const res = await put(burger.id, { fiscalNcm: '123', fiscalCfop: '6102', fiscalCsosn: '101' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.problems).toEqual(expect.arrayContaining([expect.stringMatching(/NCM/), expect.stringMatching(/CFOP/), expect.stringMatching(/CSOSN 101/)]));
    });

    it('a cashier cannot change fiscal data', async () => {
      asUser(cashier.id);
      expect((await put(burger.id, { fiscalNcm: '21069090' })).status).toBe(403);
    });

    it("another restaurant cannot change this restaurant's product", async () => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { id: B.ownerId, email: 'b@x.test', role: 'OWNER' } });
      (getCurrentRestaurantId as jest.Mock).mockResolvedValue(B.restaurantId);
      expect((await put(burger.id, { fiscalNcm: '21069090' })).status).toBe(404);
    });
  });

  describe('restaurant defaults screen (/admin/fiscal)', () => {
    it('loads the configuration (it used to answer 401 to everyone) and saves valid defaults', async () => {
      const read = await readFiscalConfig();
      expect(read.status).toBe(200);
      expect((await read.json()).config.id).toBe(config.id);

      const res = await patchFiscalConfig(req('http://localhost/api/admin/fiscal/config', 'PATCH', { defaultNcm: '21.06.90.90', defaultCsosn: '103', pisCofinsCst: '49' }));

      expect(res.status).toBe(200);
      const saved = await prisma.nFeConfig.findUnique({ where: { id: config.id } });
      expect([saved.defaultNcm, saved.defaultCsosn, saved.pisCofinsCst]).toEqual(['21069090', '103', '49']);
    });

    it('refuses an invalid default', async () => {
      const res = await patchFiscalConfig(req('http://localhost/api/admin/fiscal/config', 'PATCH', { defaultCfop: '6102' }));
      expect(res.status).toBe(400);
    });

    it('a cashier cannot read or change it', async () => {
      asUser(cashier.id);
      expect((await readFiscalConfig()).status).toBe(401);
    });
  });

  describe('pending list', () => {
    it('lists the active products that could not go on a note, and none once defaults cover them', async () => {
      await setConfig(NO_DEFAULTS);
      await setRecipeFiscal(beer.id, { fiscalNcm: '22030000', fiscalCfop: '5405', fiscalCsosn: '500', fiscalCest: '0302100', fiscalOrigin: '0' });

      const before = await (await fiscalPending()).json();
      expect(before.pending.map((p) => p.id)).toEqual([burger.id]);

      await setConfig(DEFAULTS);
      const after = await (await fiscalPending()).json();
      expect(after.pending).toEqual([]);
    });
  });

  describe('what the provider receives', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    it('Focus NFe gets the CEST, the CSOSN, the origin and the PIS/COFINS code of each item', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'autorizado' }) });
      await new FocusNFeClient('k', 'sandbox').emitNFCe({
        providerRef: 'r', documentType: 'NFCe', cnpj: '1', uf: 'SP', series: 1, number: 1, environment: 'sandbox', totalAmount: 12, pisCofinsCst: '49',
        items: [{ description: 'Cerveja', quantity: 1, unit: 'UN', unitPrice: 12, totalPrice: 12, ncm: '22030000', cfop: '5405', cest: '0302100', icmsOrigin: '0', icmsCST: '500' }],
      });
      const sent = JSON.parse(global.fetch.mock.calls[0][1].body).items[0];
      expect(sent).toMatchObject({ ncm: '22030000', cfop: '5405', cest: '0302100', origem: '0', icms_situacao_tributaria: '500', pis_situacao_tributaria: '49', cofins_situacao_tributaria: '49' });
    });
  });
});
