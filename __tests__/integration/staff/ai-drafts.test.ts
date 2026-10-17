// @ts-nocheck
/** Proposal tools: drafts only, nothing written (spec 2026-10-17 ia-implantacao §4.2-§4.3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/ai/client', () => ({ getAnthropic: jest.fn() }));
import { getAnthropic } from '../../../lib/ai/client';
import { askQuestion } from '../../../lib/ai/ask';
import { runTool } from '../../../lib/ai/tools/run';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const text = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage });
const toolUse = (name, input = {}) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${crypto.randomBytes(3).toString('hex')}`, name, input }], usage });
const script = (...responses) => {
  const create = jest.fn();
  responses.forEach((r) => create.mockResolvedValueOnce(r));
  getAnthropic.mockReturnValue({ messages: { create } });
  return create;
};

describe('proposal tools', () => {
  let rid, owner, cook, ids = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `aid-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Aid ${tag}`, ownerId: o.id, status: 'ACTIVE', createdAt: new Date(Date.now() - 40 * 86400000) } })).id;
    const c = await prisma.user.create({ data: { email: `aid-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    owner = { userId: o.id, restaurantId: rid, role: 'OWNER' }; cook = { userId: c.id, restaurantId: rid, role: 'COOK' }; ids = [o.id, c.id];
  });
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); } catch {}
  });
  beforeEach(() => jest.clearAllMocks());

  it('propor_cardapio creates a PENDING draft and writes no menu item', async () => {
    script(toolUse('propor_cardapio', { categorias: [{ nome: 'Espetos', itens: [{ nome: 'Espeto de frango', descricao: '', preco: 9.5 }] }], incompleto: false }), text('Montei o rascunho.'));
    const r = await askQuestion(owner, { question: 'cadastre: espeto de frango 9,50' });
    expect(r.body.drafts).toEqual([expect.objectContaining({ kind: 'MENU', resumo: 'Cardápio: 1 categoria, 1 item' })]);
    const d = await prisma.aiDraft.findUnique({ where: { id: r.body.drafts[0].id } });
    expect(d).toMatchObject({ status: 'PENDING', restaurantId: rid, createdById: owner.userId });
    expect(d.questionId).not.toBeNull();
    expect(d.expiresAt.getTime() - d.createdAt.getTime()).toBeGreaterThan(6.9 * 86400000);
    expect(await prisma.menuItem.count({ where: { restaurantId: rid } })).toBe(0);
  });

  it('propor_mesas and propor_equipe create drafts only', async () => {
    const r1 = await runTool(owner, 'propor_mesas', { quantidade: 10, inicio: 1, area: 'Salão', lugares: 4 }, new Date(), {});
    expect(r1).toMatchObject({ ok: true, data: { resumo: 'Mesas 1 a 10, Salão, 4 lugares' } });
    const r2 = await runTool(owner, 'propor_equipe', { pessoas: [{ nome: 'João', email: '', papel: 'CAIXA' }] }, new Date(), {});
    expect(r2).toMatchObject({ ok: true, data: { resumo: 'Equipe: 1 pessoa' } });
    expect(await prisma.table.count({ where: { restaurantId: rid } })).toBe(0);
    expect(await prisma.user.count({ where: { name: 'João', currentRestaurantId: rid } })).toBe(0);
  });

  it('a cook is not offered the proposal tools and a scripted call is denied', async () => {
    const create = script(toolUse('propor_cardapio', { categorias: [], incompleto: false }), text('Isso é do dono.'));
    await askQuestion(cook, { question: 'cadastre o cardápio' });
    expect(create.mock.calls[0][0].tools.map((t) => t.name)).not.toContain('propor_cardapio');
    expect(await prisma.aiDraft.count({ where: { restaurantId: rid, createdById: cook.userId } })).toBe(0);
  });

  it('invalid proposal input is a tool error the model sees, no draft', async () => {
    const before = await prisma.aiDraft.count({ where: { restaurantId: rid } });
    const r = await runTool(owner, 'propor_mesas', { quantidade: 500, inicio: 1, area: 'Salão', lugares: 4 }, new Date(), {});
    expect(r).toMatchObject({ ok: false, denied: false });
    expect(await prisma.aiDraft.count({ where: { restaurantId: rid } })).toBe(before);
  });
});
