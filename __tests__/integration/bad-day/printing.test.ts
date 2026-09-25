// @ts-nocheck
/**
 * Printing phase 1 (owner decision 2026-09-24, no printer bought yet; follow-up of bad-day scenario 2):
 * the kitchen ticket and the customer receipt are built by the server (lib/print/tickets.ts) and
 * printed by the browser in 80 mm (/imprimir/cozinha/[orderId], /imprimir/cupom/[sessionId]).
 * Each case states what the paper must carry and who may print it.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as kitchenTicket } from '../../../app/api/print/kitchen/[orderId]/route';
import { GET as receipt } from '../../../app/api/print/receipt/[sessionId]/route';
import { GET as listKitchen } from '../../../app/api/kds/orders/route';
import { POST as sendToKitchen } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('printing phase 1: kitchen ticket and customer receipt', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let burger: any;
  let onion: any;
  let config: any;
  let cook: any;
  const tag = crypto.randomBytes(3).toString('hex');

  const as = (userId: string, restaurantId: string) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };

  /** A table comanda (table 7) with 2 burgers "sem cebola" (+0) and extra cheese (+3), sent to the kitchen. */
  const comandaAtTable = async () => {
    const s = await prisma.orderSession.create({
      data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 7, notes: 'Cliente com pressa' },
    });
    const line = await prisma.orderSessionItem.create({
      data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity: 2, specialInstructions: 'bem passado' },
    });
    await prisma.orderSessionItemModifier.create({ data: { sessionItemId: line.id, modifierId: onion.id, priceAdjustment: 3 } });
    const res = await sendToKitchen(new Request(`http://localhost/api/comanda/sessions/${s.id}/send-to-kitchen`, { method: 'POST' }) as any, { params: { id: s.id } });
    const { order } = await res.json();
    return { s, orderId: order.id };
  };

  const getTicket = (orderId: string) => kitchenTicket(new Request('http://localhost') as any, { params: { orderId } });
  const getReceipt = (sessionId: string) => receipt(new Request('http://localhost') as any, { params: { sessionId } });

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    burger = await prisma.recipe.create({
      data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `X-Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 },
    });
    onion = await prisma.itemModifier.create({ data: { restaurantId: A.restaurantId, name: `Queijo extra sem cebola ${tag}`, priceAdjustment: 3 } });
    config = await prisma.nFeConfig.create({
      data: { restaurantId: A.restaurantId, cnpj: `7${Date.now()}`.slice(0, 14), tradeName: `Lanchonete ${tag}`, stateRegistration: '123456', environment: 'sandbox' },
    });
    cook = await prisma.user.create({
      data: { email: `cook-${tag}@print.test`, name: 'Cozinheiro', password: 'x', role: 'COOK', currentRestaurantId: A.restaurantId, active: true },
    });
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: cook.id, role: 'COOK', isActive: true } });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.nFeDocument.deleteMany({ where: { configId: config.id } });
    await prisma.nFeConfig.deleteMany({ where: { id: config.id } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.itemModifier.deleteMany({ where: { id: onion.id } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cook.id } });
    await prisma.user.deleteMany({ where: { id: cook.id } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    as(A.ownerId, A.restaurantId);
  });

  describe('kitchen ticket', () => {
    it('carries the table, the quantities, the modifiers and the notes', async () => {
      const { orderId } = await comandaAtTable();

      const res = await getTicket(orderId);
      const ticket = await res.json();

      expect(res.status).toBe(200);
      expect(ticket.kind).toBe('Mesa');
      expect(ticket.where).toBe('7');
      expect(ticket.lines).toEqual([{ quantity: 2, name: `X-Burger ${tag}`, modifiers: [`Queijo extra sem cebola ${tag}`], notes: 'bem passado' }]);
      expect(ticket.notes).toBe('Cliente com pressa');
    });

    it('a cook of the restaurant can print it', async () => {
      const { orderId } = await comandaAtTable();
      as(cook.id, A.restaurantId);
      expect((await getTicket(orderId)).status).toBe(200);
    });

    it("another restaurant cannot print this restaurant's order", async () => {
      const { orderId } = await comandaAtTable();
      as(B.ownerId, B.restaurantId);
      expect((await getTicket(orderId)).status).toBe(404);
    });

    it('the kitchen screen list carries the modifiers too', async () => {
      const { orderId } = await comandaAtTable();
      const body = await (await listKitchen(new Request('http://localhost/api/kds/orders?status=PENDING') as any)).json();
      const order = body.orders.find((o) => o.id === orderId);
      expect(order.items[0].modifiers.map((m) => m.modifier.name)).toEqual([`Queijo extra sem cebola ${tag}`]);
    });
  });

  describe('customer receipt', () => {
    it('carries the lines as charged (modifier per unit), the total and the restaurant fiscal data', async () => {
      const { s } = await comandaAtTable();

      const r = await (await getReceipt(s.id)).json();

      expect(r.restaurant.name).toBe(`Lanchonete ${tag}`);
      expect(r.restaurant.cnpj).toBe(config.cnpj);
      expect(r.title).toBe('Mesa 7');
      expect(r.lines[0]).toMatchObject({ quantity: 2, unitPrice: 30, total: 66 });
      expect(r.total).toBe(66);
      expect(r.nfce).toBeNull();
    });

    it('carries the NFC-e: number, series, key, protocol, QR data, CPF, payment and the homologation flag', async () => {
      const { s } = await comandaAtTable();
      const key = '35260911111111000111650010000000421234567890';
      await prisma.nFeDocument.create({
        data: {
          configId: config.id, orderSessionId: s.id, documentType: 'NFCe', documentSeries: 1, documentNumber: 42,
          status: 'authorized', accessKey: key, protocolNumber: 'P123', authorizedAt: new Date(), customerCPF: '12345678909',
          qrCodeData: `https://www.fazenda.sp.gov.br/nfce/consulta?chNFe=${key}`, dataSnapshot: { paymentMethod: 'pix' },
        },
      });

      const r = await (await getReceipt(s.id)).json();

      expect(r.nfce).toMatchObject({ status: 'authorized', number: 42, series: 1, accessKey: key, protocolNumber: 'P123', homologation: true });
      expect(r.nfce.qrCodeData).toContain(key);
      expect(r.customerCPF).toBe('12345678909');
      expect(r.paymentMethod).toBe('pix');
    });

    it('a rejected note is not printed as if it were valid', async () => {
      const { s } = await comandaAtTable();
      await prisma.nFeDocument.create({
        data: { configId: config.id, orderSessionId: s.id, documentType: 'NFCe', documentSeries: 1, documentNumber: 77, status: 'rejected' },
      });
      expect((await (await getReceipt(s.id)).json()).nfce).toBeNull();
    });

    it('a cook cannot print a customer receipt', async () => {
      const { s } = await comandaAtTable();
      as(cook.id, A.restaurantId);
      expect((await getReceipt(s.id)).status).toBe(403);
    });

    it("another restaurant cannot print this restaurant's receipt", async () => {
      const { s } = await comandaAtTable();
      as(B.ownerId, B.restaurantId);
      expect((await getReceipt(s.id)).status).toBe(404);
    });
  });
});
