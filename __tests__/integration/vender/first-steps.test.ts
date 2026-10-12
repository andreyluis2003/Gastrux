// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { firstSteps } from '../../../lib/onboarding/first-steps';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('primeiros passos', () => {
  let ownerId, rid;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `fs-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `FS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
  });
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });
  const done = async () => Object.fromEntries((await firstSteps(rid)).map((s) => [s.key, s.done]));

  it('a new account has every step to do, in order', async () => {
    expect((await firstSteps(rid)).map((s) => s.key)).toEqual(['caixa', 'venda', 'cardapio', 'endereco', 'nfce']);
    expect(await done()).toEqual({ caixa: false, venda: false, cardapio: false, endereco: false, nfce: false });
  });

  it('each step is done by what the restaurant actually did', async () => {
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', tableNumber: 1 } });
    await prisma.restaurant.update({ where: { id: rid }, data: { address: 'Rua A, 1' } });
    const d = await done();
    expect(d.venda).toBe(true);
    expect(d.endereco).toBe(true);
    expect(d.caixa).toBe(false);
  });
});
