// @ts-nocheck
/**
 * "Bad day" scenario 7 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * the fiscal authority (SEFAZ, through the NFC-e provider) rejects a note, or does not answer.
 * Each case states the DESIRED behaviour: the sale is preserved, the operator learns why, the note
 * can be corrected and re-sent under the SAME number (a number is never burned nor used twice), an
 * unknown outcome is never taken for a rejection, the note matches what the customer paid, and one
 * restaurant can never read, re-send or cancel another restaurant's notes.
 * A case that documents a known gap is written with `it.failing` (the suite stays green and a case
 * flips to a failure the day its gap is fixed). Gaps, by priority:
 *   (F1 fixed 2026-09-24: every /api/nfe/documents/[id] route (GET, PUT, DELETE, submit, status,
 *   cancel) loaded the document by id only, so any signed-in user could read another restaurant's
 *   notes (customer CPF) and CANCEL a real note at SEFAZ with the other restaurant's key; now scoped
 *   through config.restaurantId and another restaurant's note is a 404)
 *   (F5 fixed 2026-09-24: the NFC-e ignored modifiers, 2 x (30 + 3 extra) was charged 66 and declared
 *   60; /api/nfe/emit now uses lib/comanda/line-total.ts)
 *   (F3 fixed 2026-09-24: a network error / timeout / 408 / 429 / 5xx was recorded as "rejected" although
 *   the note may have been authorised; now "processing", which blocks a second emission)
 *   (F2 F4 fixed 2026-09-24, lib/nfe/numbering.ts: unique (config, type, series, number); the number
 *   is reserved in the insert transaction; emitting again after a rejection re-sends the same note
 *   under its number instead of burning the next one; unused numbers are listed for inutilização)
 *   (F6 fixed 2026-09-24, lib/nfe/emit-session.ts: auto-emit always failed and nothing called it; now
 *   it shares the manual rules, and closing a comanda (PUT status CLOSED) issues the note when
 *   NFeConfig.autoIssueOnSale is on, the default for new configs)
 *   (F7 F8 fixed 2026-09-24: a re-send keeps the payment method first declared; a rejection, denial
 *   or unknown outcome leaves a notification for the restaurant)
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

const fakeProvider = {
  name: 'fake',
  emitNFCe: jest.fn(),
  emitNFe: jest.fn(),
  getStatus: jest.fn(),
  cancelNFCe: jest.fn(),
};
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as emit } from '../../../app/api/nfe/emit/route';
import { POST as autoEmit } from '../../../app/api/nfe/auto-emit/route';
import { POST as submit } from '../../../app/api/nfe/documents/[id]/submit/route';
import { POST as cancelDoc } from '../../../app/api/nfe/documents/[id]/cancel/route';
import { GET as readDoc } from '../../../app/api/nfe/documents/[id]/route';
import { FocusNFeClient } from '../../../lib/nfe/focus-nfe-client';
import { PUT as updateComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { listNumbersToVoid } from '../../../lib/nfe/numbering';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const authorized = () => ({
  ok: true, status: 'authorized', accessKey: `35${crypto.randomBytes(21).toString('hex').replace(/\D/g, '0').slice(0, 42)}`,
  protocolNumber: 'P1', statusDescription: 'Autorizado',
});
const rejected = (reason = 'Rejeição 778: NCM inexistente') => ({
  ok: false, status: 'rejected', rejectionReason: reason, statusDescription: 'erro_autorizacao',
});

describe('bad day 7: fiscal rejection', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let configA: any;
  let burger: any;
  let cheese: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const sessions: string[] = [];

  const asUser = (userId: string, restaurantId: string) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const asOwnerA = () => asUser(A.ownerId, A.restaurantId);
  const asOwnerB = () => asUser(B.ownerId, B.restaurantId);

  const post = (handler: any, url: string, body: any, params?: any) =>
    handler(new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as any, params ? { params } : undefined);
  const emitFor = (orderSessionId: string, extra: any = {}) =>
    post(emit, 'http://localhost/api/nfe/emit', { orderSessionId, ...extra });
  const submitDoc = (id: string) => post(submit, `http://localhost/api/nfe/documents/${id}/submit`, {}, { id });

  /** A closed comanda of restaurant A: `quantity` burgers at 30.00, each with extra cheese (+3.00) when asked. */
  const comanda = async (quantity = 1, withCheese = false) => {
    const s = await prisma.orderSession.create({
      data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'CLOSED', tableNumber: 9 },
    });
    sessions.push(s.id);
    const line = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity } });
    if (withCheese) {
      await prisma.orderSessionItemModifier.create({ data: { sessionItemId: line.id, modifierId: cheese.id, priceAdjustment: 3 } });
    }
    return s;
  };
  const docsOf = (orderSessionId: string) =>
    prisma.nFeDocument.findMany({ where: { orderSessionId }, orderBy: { createdAt: 'asc' } });

  const wipe = async () => {
    await prisma.nFeLog.deleteMany({ where: { configId: configA.id } });
    await prisma.nFeLog.deleteMany({ where: { document: { configId: configA.id } } });
    await prisma.nFeDocument.deleteMany({ where: { configId: configA.id } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.nFeConfig.update({ where: { id: configA.id }, data: { nextNumberNFCe: 1, autoIssueOnSale: true } });
  };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    configA = await prisma.nFeConfig.create({
      data: {
        restaurantId: A.restaurantId, cnpj: `${Date.now()}`.slice(-14).padStart(14, '1'), nfeApiKey: 'k',
        environment: 'sandbox', uf: 'SP', issueNFCeForCPF: true,
      },
    });
    burger = await prisma.recipe.create({
      data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Hambúrguer ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' },
    });
    cheese = await prisma.itemModifier.create({ data: { restaurantId: A.restaurantId, name: `Queijo extra ${tag}`, priceAdjustment: 3 } });
  });

  afterAll(async () => {
    await wipe();
    await prisma.orderSession.deleteMany({ where: { id: { in: sessions } } });
    await prisma.itemModifier.deleteMany({ where: { id: cheese.id } });
    await prisma.recipe.deleteMany({ where: { id: burger.id } });
    await prisma.nFeConfig.deleteMany({ where: { id: configA.id } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks keeps unused mockResolvedValueOnce values: a case whose route fails before
    // calling the provider would hand its answer to the next case.
    Object.values(fakeProvider).forEach((fn) => typeof fn === 'function' && fn.mockReset());
    await wipe();
    asOwnerA();
  });

  describe('what already works', () => {
    it('a rejection keeps the sale and records the note as rejected, with the reason, in the log', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(rejected());
      const s = await comanda();

      const res = await emitFor(s.id);
      const body = await res.json();

      expect(body.success).toBe(false);
      expect(body.rejectionReason).toBe('Rejeição 778: NCM inexistente');
      const [doc] = await docsOf(s.id);
      expect(doc.status).toBe('rejected');
      expect(doc.rejectionReason).toBe('Rejeição 778: NCM inexistente');
      const logs = await prisma.nFeLog.findMany({ where: { documentId: doc.id } });
      expect(logs.map((l) => l.eventType).sort()).toEqual(['emit_error', 'submit']);
      const after = await prisma.orderSession.findUnique({ where: { id: s.id }, include: { items: true } });
      expect(after.status).toBe('CLOSED');
      expect(after.items).toHaveLength(1);
    });

    it('a rejected note re-sent through /submit keeps its number and clears the reason once authorised', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(rejected()).mockResolvedValueOnce(authorized());
      const s = await comanda();
      await emitFor(s.id);
      const [doc] = await docsOf(s.id);

      const res = await submitDoc(doc.id);

      expect((await res.json()).success).toBe(true);
      const after = await prisma.nFeDocument.findUnique({ where: { id: doc.id } });
      expect(after.status).toBe('authorized');
      expect(after.rejectionReason).toBeNull();
      expect(after.documentNumber).toBe(doc.documentNumber);
      expect(after.providerRef).toBe(doc.providerRef);
    });

    it('a comanda with an authorised note cannot be emitted again (409)', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const s = await comanda();
      await emitFor(s.id);

      const res = await emitFor(s.id);

      expect(res.status).toBe(409);
      expect(fakeProvider.emitNFCe).toHaveBeenCalledTimes(1);
    });
  });

  describe('F1: another restaurant cannot touch the notes', () => {
    let doc: any;
    beforeEach(async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const s = await comanda();
      await emitFor(s.id, { customerCPF: '123.456.789-09' });
      [doc] = await docsOf(s.id);
      asOwnerB();
    });

    it('another restaurant cannot read a note (it holds the customer CPF)', async () => {
      const res = await readDoc(new Request(`http://localhost/api/nfe/documents/${doc.id}`) as any, { params: { id: doc.id } });
      expect(res.status).toBe(404);
    });

    it('another restaurant cannot cancel a note at SEFAZ', async () => {
      fakeProvider.cancelNFCe.mockResolvedValueOnce({ ok: true, status: 'cancelled' });
      const res = await post(cancelDoc, `http://localhost/api/nfe/documents/${doc.id}/cancel`,
        { justificativa: 'Cancelamento indevido por outro restaurante' }, { id: doc.id });
      expect(res.status).toBe(404);
      expect(fakeProvider.cancelNFCe).not.toHaveBeenCalled();
      expect((await prisma.nFeDocument.findUnique({ where: { id: doc.id } })).status).toBe('authorized');
    });

    it('another restaurant cannot re-send a rejected note', async () => {
      await prisma.nFeDocument.update({ where: { id: doc.id }, data: { status: 'rejected' } });
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const res = await submitDoc(doc.id);
      expect(res.status).toBe(404);
      expect(fakeProvider.emitNFCe).toHaveBeenCalledTimes(1); // only A's original emission
    });
  });

  describe('F5: the note declares what the customer paid', () => {
    it('2 burgers with extra cheese are declared 66.00, the amount charged', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const s = await comanda(2, true);

      await emitFor(s.id);

      const [doc] = await docsOf(s.id);
      expect(Number(doc.totalAmount)).toBe(66);
      expect(fakeProvider.emitNFCe.mock.calls[0][0].totalAmount).toBe(66);
    });
  });

  describe('F3: an unknown outcome is not a rejection', () => {
    const client = new FocusNFeClient('key', 'sandbox');
    const payload = {
      providerRef: 'ref-1', documentType: 'NFCe', cnpj: '11111111000111', uf: 'SP', series: 1, number: 1,
      environment: 'sandbox', items: [{ description: 'X', quantity: 1, unit: 'UN', unitPrice: 10, totalPrice: 10 }], totalAmount: 10,
    };
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    it('a network error / timeout leaves the note to be checked, not rejected', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      const result = await client.emitNFCe(payload);
      expect(result.status).not.toBe('rejected');
    });

    it('an HTTP 5xx from the provider leaves the note to be checked, not rejected', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
      const result = await client.emitNFCe(payload);
      expect(result.status).not.toBe('rejected');
    });

    it('an unknown outcome keeps the note in processing and the comanda cannot be emitted again', async () => {
      fakeProvider.emitNFCe.mockImplementationOnce((p) => new FocusNFeClient('key', 'sandbox').emitNFCe(p));
      global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      const s = await comanda();

      const body = await (await emitFor(s.id)).json();
      const again = await emitFor(s.id);

      expect(body.success).toBe(false);
      expect(body.rejectionReason).toMatch(/processamento/);
      const docs = await docsOf(s.id);
      expect(docs).toHaveLength(1);
      expect(docs[0].status).toBe('processing');
      expect(docs[0].rejectionReason).toBeNull();
      expect(again.status).toBe(409);
    });

    it('a validation error from the provider (HTTP 4xx) is a rejection with its message', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 422, json: async () => ({ mensagem: 'CPF do destinatário inválido' }),
      });
      const result = await client.emitNFCe(payload);
      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('CPF do destinatário inválido');
    });
  });

  describe('F2 / F4: numbering', () => {
    it('two notes of the same type and series can never share a number', async () => {
      const base = { configId: configA.id, documentType: 'NFCe', documentSeries: 1, documentNumber: 900, status: 'pending' };
      await prisma.nFeDocument.create({ data: base });
      await expect(prisma.nFeDocument.create({ data: base })).rejects.toThrow();
    });

    it('emitting again after a rejection re-sends the same note instead of burning a number', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(rejected()).mockResolvedValueOnce(authorized());
      const s = await comanda();
      await emitFor(s.id);

      await emitFor(s.id);

      const docs = await docsOf(s.id);
      expect(docs).toHaveLength(1);
      expect(docs[0].status).toBe('authorized');
      expect((await prisma.nFeConfig.findUnique({ where: { id: configA.id } })).nextNumberNFCe).toBe(2);
    });
  });

  describe('F6: automatic emission', () => {
    it('auto-emit issues the note of a closed comanda', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const s = await comanda();

      const body = await (await post(autoEmit, 'http://localhost/api/nfe/auto-emit', { orderSessionId: s.id })).json();

      expect(body.nfce?.status).toBe('authorized');
      expect((await docsOf(s.id))[0]?.status).toBe('authorized');
    });
  });

  describe('F7 / F8: correction and follow-up', () => {
    it('re-sending a rejected note keeps the payment method first declared', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(rejected()).mockResolvedValueOnce(authorized());
      const s = await comanda();
      await emitFor(s.id, { paymentMethod: 'pix' });
      const [doc] = await docsOf(s.id);

      await submitDoc(doc.id);

      expect(fakeProvider.emitNFCe.mock.calls[1][0].paymentMethod).toBe('pix');
    });

    it('a rejection leaves an alert for the restaurant, not only a toast', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(rejected());
      const s = await comanda();

      await emitFor(s.id);

      expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBeGreaterThan(0);
    });
  });

  describe('numbering under pressure', () => {
    it('five comandas emitted at once get five different consecutive numbers', async () => {
      fakeProvider.emitNFCe.mockImplementation(async () => authorized());
      const all = await Promise.all([1, 2, 3, 4, 5].map(() => comanda()));

      const answers = await Promise.all(all.map((s) => emitFor(s.id)));

      expect(answers.every((r) => r.status === 200)).toBe(true);
      const numbers = (await prisma.nFeDocument.findMany({ where: { configId: configA.id } }))
        .map((d) => d.documentNumber)
        .sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2, 3, 4, 5]);
      expect((await prisma.nFeConfig.findUnique({ where: { id: configA.id } })).nextNumberNFCe).toBe(6);
    });

    it('two clicks at once on the same comanda issue one note (the other gets 409)', async () => {
      fakeProvider.emitNFCe.mockImplementation(async () => authorized());
      const s = await comanda();

      const answers = await Promise.all([emitFor(s.id), emitFor(s.id)]);

      expect(answers.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await docsOf(s.id)).toHaveLength(1);
      expect(fakeProvider.emitNFCe).toHaveBeenCalledTimes(1);
    });

    it('a counter behind a number already used skips it instead of duplicating', async () => {
      await prisma.nFeDocument.create({
        data: { configId: configA.id, documentType: 'NFCe', documentSeries: 1, documentNumber: 1, status: 'authorized' },
      });
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const s = await comanda();

      const res = await emitFor(s.id);

      expect(res.status).toBe(200);
      expect((await docsOf(s.id))[0].documentNumber).toBe(2);
    });

    it('a denied note keeps its number: emitting again uses the next one', async () => {
      fakeProvider.emitNFCe
        .mockResolvedValueOnce({ ok: false, status: 'denied', rejectionReason: 'Uso denegado: irregularidade fiscal do emitente' })
        .mockResolvedValueOnce(authorized());
      const s = await comanda();
      await emitFor(s.id);

      await emitFor(s.id);

      const docs = await docsOf(s.id);
      expect(docs.map((d) => [d.documentNumber, d.status])).toEqual([[1, 'denied'], [2, 'authorized']]);
    });

    it('lists the numbers to void: holes and rejected notes nobody re-sent', async () => {
      const base = { configId: configA.id, documentType: 'NFCe', documentSeries: 1 };
      await prisma.nFeDocument.create({ data: { ...base, documentNumber: 1, status: 'authorized' } });
      const rej = await prisma.nFeDocument.create({ data: { ...base, documentNumber: 2, status: 'rejected' } });
      await prisma.nFeDocument.create({ data: { ...base, documentNumber: 4, status: 'authorized' } });
      await prisma.nFeDocument.create({ data: { ...base, documentNumber: 5, status: 'processing' } });
      await prisma.nFeConfig.update({ where: { id: configA.id }, data: { nextNumberNFCe: 7 } });

      const toVoid = await listNumbersToVoid(configA.id);

      expect(toVoid).toEqual([
        { documentType: 'NFCe', series: 1, number: 2, reason: 'rejected', documentId: rej.id },
        { documentType: 'NFCe', series: 1, number: 3, reason: 'gap' },
        { documentType: 'NFCe', series: 1, number: 6, reason: 'gap' },
      ]);
    });
  });

  describe('closing the comanda issues the note (owner decision 2026-09-24)', () => {
    const close = (id: string, body: any = {}) =>
      updateComanda(
        new Request(`http://localhost/api/comanda/sessions/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'CLOSED', ...body }) }) as any,
        { params: { id } }
      );
    const openComanda = async () => {
      const s = await comanda();
      await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'OPEN' } });
      return s;
    };

    it('closes and issues the note with the CPF and payment method asked at the close', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(authorized());
      const s = await openComanda();

      const res = await close(s.id, { customerCPF: '123.456.789-09', paymentMethod: 'pix' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe('CLOSED');
      expect(body.nfce.nfce.status).toBe('authorized');
      const sent = fakeProvider.emitNFCe.mock.calls[0][0];
      expect(sent.customerCPF).toBe('12345678909');
      expect(sent.paymentMethod).toBe('pix');
    });

    it('closing twice issues one note', async () => {
      fakeProvider.emitNFCe.mockImplementation(async () => authorized());
      const s = await openComanda();

      await close(s.id);
      await close(s.id);

      expect(await docsOf(s.id)).toHaveLength(1);
    });

    it('a rejection does not block the close and leaves an alert', async () => {
      fakeProvider.emitNFCe.mockResolvedValueOnce(rejected());
      const s = await openComanda();

      const res = await close(s.id);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('CLOSED');
      expect(body.nfce.message).toMatch(/rejeitada/);
      expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });

    it('with automatic emission turned off, closing issues no note', async () => {
      await prisma.nFeConfig.update({ where: { id: configA.id }, data: { autoIssueOnSale: false } });
      const s = await openComanda();

      const body = await (await close(s.id)).json();

      expect(body.status).toBe('CLOSED');
      expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
      expect(await docsOf(s.id)).toHaveLength(0);
    });

    it('a cancelled comanda cannot be closed', async () => {
      const s = await openComanda();
      await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });

      const res = await close(s.id);

      expect(res.status).toBe(409);
      expect(fakeProvider.emitNFCe).not.toHaveBeenCalled();
    });
  });

  it.todo('the NFe webhook understands the Focus NFe payload (ref / chave_nfe / "autorizado")');
  it.todo('contingency mode (config.contingencyMode) is used when SEFAZ is down');
  it.todo('a note stuck in "processing" is checked again automatically');
});
