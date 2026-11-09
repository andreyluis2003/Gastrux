// @ts-nocheck
/**
 * Suggested replies for the official number's conversations (spec 2026-11-09): one stored suggestion per
 * client message, regenerate, team topics, FAILED with cost, settle on send, 14-day stats.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/ai/client', () => ({ getAnthropic: jest.fn() }));
import { getAnthropic } from '../../../lib/ai/client';
import { getOrCreateSuggestion, discardSuggestion, settleSuggestion, suggestionStats } from '../../../lib/agents/whatsapp/suggest';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const HOUR = 3_600_000;

let owner: any;
let restaurant: any;
let key: string; // the client's number
let visitor: string; // a number with no account
let other: string;
const now = new Date();

function mockReply(text: string) {
  const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 200 } });
  (getAnthropic as jest.Mock).mockReturnValue({ messages: { create } });
  return create;
}
const sugestao = (texto: string) => JSON.stringify({ tipo: 'sugestao', texto });

let seq = 0;
function msg(phone: string, direction: 'IN' | 'OUT', text: string, ageMs: number, extra: any = {}) {
  seq++;
  return prisma.agentWhatsAppMessage.create({
    data: { phone, waId: phone, direction, text, messageType: 'text', waMessageId: `wamid.t.${phone}.${seq}`, createdAt: new Date(now.getTime() - ageMs), ...extra },
  });
}

describe('suggested replies', () => {
  beforeAll(async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const n = String(crypto.randomInt(90000000, 99999999));
    owner = await prisma.user.create({ data: { email: `sg-${tag}@gastrux.test`, name: 'Maria Silva', role: 'OWNER', whatsapp: `55669${n}` } });
    restaurant = await prisma.restaurant.create({ data: { name: `Pizzaria ${tag}`, ownerId: owner.id, status: 'TRIAL' } });
    key = `5566${n}`;
    visitor = `5511${String(crypto.randomInt(10000000, 99999999))}`;
    other = `5521${String(crypto.randomInt(10000000, 99999999))}`;
  });

  afterAll(async () => {
    await prisma.agentReplySuggestion.deleteMany({ where: { phone: { in: [key, visitor, other] } } });
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: { in: [key, visitor, other] } } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => {});
  });

  beforeEach(async () => {
    (getAnthropic as jest.Mock).mockReset();
    await prisma.agentReplySuggestion.deleteMany({ where: { phone: { in: [key, visitor, other] } } });
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: { in: [key, visitor, other] } } });
  });

  const clientIn = (text: string, ageMs: number, extra: any = {}) => msg(key, 'IN', text, ageMs, { userId: owner.id, restaurantId: restaurant.id, ...extra });

  it("opening a conversation whose last message is the client's stores one suggestion", async () => {
    await clientIn('quanto custa o Pro?', HOUR);
    const create = mockReply(sugestao('O Pro custa R$ 99 por mês.'));
    const v = await getOrCreateSuggestion(key, { now });
    expect(v).toMatchObject({ state: 'ready', kind: 'SUGGESTION', text: 'O Pro custa R$ 99 por mês.' });
    expect(create).toHaveBeenCalledTimes(1);
    const rows = await prisma.agentReplySuggestion.findMany({ where: { phone: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].costUsd).toBeGreaterThan(0);
    expect(rows[0].outcome).toBe('pending');
    expect(rows[0].model).toBeTruthy();
  });

  it('reopening returns the stored suggestion', async () => {
    await clientIn('oi', HOUR);
    const create = mockReply(sugestao('Olá!'));
    const a = await getOrCreateSuggestion(key, { now });
    const b = await getOrCreateSuggestion(key, { now });
    expect(b.id).toBe(a.id);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a new client message gets a new suggestion', async () => {
    await clientIn('oi', 2 * HOUR);
    const create = mockReply(sugestao('Olá!'));
    const a = await getOrCreateSuggestion(key, { now });
    await clientIn('e então?', HOUR);
    const b = await getOrCreateSuggestion(key, { now });
    expect(b.id).not.toBe(a.id);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('several client messages in a row → one call that sees all of them', async () => {
    await clientIn('primeira pergunta sobre cardápio', 3 * HOUR);
    await clientIn('segunda pergunta sobre estoque', 2 * HOUR);
    const create = mockReply(sugestao('Vamos ver os dois.'));
    await getOrCreateSuggestion(key, { now });
    expect(create).toHaveBeenCalledTimes(1);
    const prompt = create.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('primeira pergunta sobre cardápio');
    expect(prompt).toContain('segunda pergunta sobre estoque');
  });

  it('regenerate discards the previous one and asks again', async () => {
    await clientIn('oi', HOUR);
    const create = mockReply(sugestao('Olá!'));
    const a = await getOrCreateSuggestion(key, { now });
    const b = await getOrCreateSuggestion(key, { now, regenerate: true, by: 'equipe@gastrux.test' });
    expect(b.id).not.toBe(a.id);
    expect(create).toHaveBeenCalledTimes(2);
    const prev = await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } });
    expect(prev.outcome).toBe('discarded');
    expect(prev.decidedBy).toBe('equipe@gastrux.test');
  });

  it('last message from the team → none', async () => {
    await clientIn('oi', 3 * HOUR);
    await msg(key, 'OUT', 'Olá!', HOUR);
    const create = mockReply(sugestao('x'));
    expect(await getOrCreateSuggestion(key, { now })).toEqual({ state: 'none' });
    expect(create).not.toHaveBeenCalled();
  });

  it('window closed (last IN 25 h ago) → none', async () => {
    await clientIn('oi', 25 * HOUR);
    const create = mockReply(sugestao('x'));
    expect(await getOrCreateSuggestion(key, { now })).toEqual({ state: 'none' });
    expect(create).not.toHaveBeenCalled();
  });

  it('a team topic comes back as TEAM', async () => {
    await clientIn('quero cancelar', HOUR);
    mockReply(JSON.stringify({ tipo: 'equipe', motivo: 'Pedido de cancelamento' }));
    const v = await getOrCreateSuggestion(key, { now });
    expect(v).toMatchObject({ state: 'ready', kind: 'TEAM', reason: 'Pedido de cancelamento' });
    const row = await prisma.agentReplySuggestion.findUnique({ where: { id: v.id } });
    expect(row.outcome).toBe('team');
  });

  it('audio goes to the team without calling the AI', async () => {
    await clientIn('[audio]', HOUR, { messageType: 'audio' });
    const create = mockReply(sugestao('x'));
    const v = await getOrCreateSuggestion(key, { now });
    expect(v).toMatchObject({ state: 'ready', kind: 'TEAM' });
    expect(v.reason).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    const row = await prisma.agentReplySuggestion.findUnique({ where: { id: v.id } });
    expect(row.outcome).toBe('team');
    expect(row.costUsd).toBe(0);
  });

  it('invalid output is FAILED with its cost', async () => {
    await clientIn('oi', HOUR);
    mockReply(sugestao('Veja https://gastrux.com/a e https://gastrux.com/b'));
    const v = await getOrCreateSuggestion(key, { now });
    expect(v).toMatchObject({ state: 'ready', kind: 'FAILED' });
    const row = await prisma.agentReplySuggestion.findUnique({ where: { id: v.id } });
    expect(row.outcome).toBe('failed');
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it('a call that throws is FAILED with no cost', async () => {
    await clientIn('oi', HOUR);
    (getAnthropic as jest.Mock).mockReturnValue({ messages: { create: jest.fn().mockRejectedValue(new Error('boom')) } });
    const v = await getOrCreateSuggestion(key, { now });
    expect(v).toMatchObject({ state: 'ready', kind: 'FAILED' });
    const row = await prisma.agentReplySuggestion.findUnique({ where: { id: v.id } });
    expect(row.costUsd).toBe(0);
  });

  it('without ANTHROPIC_API_KEY → unavailable, nothing stored', async () => {
    await clientIn('oi', HOUR);
    (getAnthropic as jest.Mock).mockReturnValue(null);
    expect(await getOrCreateSuggestion(key, { now })).toEqual({ state: 'unavailable' });
    expect(await prisma.agentReplySuggestion.count({ where: { phone: key } })).toBe(0);
  });

  it('visitor context', async () => {
    await msg(visitor, 'IN', 'como funciona?', HOUR);
    const create = mockReply(sugestao('Funciona assim.'));
    await getOrCreateSuggestion(visitor, { now });
    expect(create.mock.calls[0][0].messages[0].content).toContain('https://gastrux.com');
  });

  it('settle uses the given id only, and only if it belongs to this phone and is pending', async () => {
    await clientIn('oi', HOUR);
    mockReply(sugestao('Olá, tudo bem? Posso ajudar.'));
    const a = await getOrCreateSuggestion(key, { now });
    await settleSuggestion(key, undefined, 'Olá, tudo bem? Posso ajudar.', 'wamid.s1', 'equipe');
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } })).outcome).toBe('pending');
    await settleSuggestion(other, a.id, 'Olá, tudo bem? Posso ajudar.', 'wamid.s2', 'equipe');
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } })).outcome).toBe('pending');
    await settleSuggestion(key, a.id, 'Olá, tudo bem? Posso ajudar.', 'wamid.s3', 'equipe');
    const row = await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } });
    expect(row).toMatchObject({ outcome: 'sent_as_is', sentMessageId: 'wamid.s3', decidedBy: 'equipe' });

    await clientIn('outra', 30 * 60_000);
    const b = await getOrCreateSuggestion(key, { now });
    await settleSuggestion(key, b.id, 'Texto completamente diferente do sugerido, com bem mais conteúdo que o original.', 'wamid.s4', 'equipe');
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: b.id } })).outcome).toBe('sent_edited');
    // already settled: no change
    await settleSuggestion(key, b.id, 'Olá, tudo bem? Posso ajudar.', 'wamid.s5', 'equipe');
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: b.id } })).sentMessageId).toBe('wamid.s4');
  });

  it("discard only works on this phone's pending suggestion", async () => {
    await clientIn('oi', HOUR);
    mockReply(sugestao('Olá!'));
    const a = await getOrCreateSuggestion(key, { now });
    await discardSuggestion(other, a.id, 'equipe');
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } })).outcome).toBe('pending');
    await discardSuggestion(key, a.id, 'equipe');
    expect(await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } })).toMatchObject({ outcome: 'discarded', decidedBy: 'equipe' });
  });

  it('stats: 14 days, expires stale pending', async () => {
    const before = await suggestionStats(now);
    const row = (outcome: string, kind: string, ageH: number) =>
      prisma.agentReplySuggestion.create({
        data: { phone: key, forMessageId: `m-${crypto.randomBytes(4).toString('hex')}`, forMessageAt: new Date(now.getTime() - ageH * HOUR), kind, outcome, createdAt: new Date(now.getTime() - ageH * HOUR) },
      });
    await row('sent_as_is', 'SUGGESTION', 2);
    await row('sent_as_is', 'SUGGESTION', 3);
    await row('sent_edited', 'SUGGESTION', 4);
    await row('discarded', 'SUGGESTION', 5);
    await row('team', 'TEAM', 6);
    await row('failed', 'FAILED', 6);
    const stale = await row('pending', 'SUGGESTION', 25);
    await row('sent_as_is', 'SUGGESTION', 15 * 24); // older than 14 days
    const s = await suggestionStats(now);
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: stale.id } })).outcome).toBe('expired');
    expect(s.asIs - before.asIs).toBe(2);
    expect(s.edited - before.edited).toBe(1);
    expect(s.discarded - before.discarded).toBe(1);
    expect(s.team - before.team).toBe(1);
    expect(s.made - before.made).toBe(5); // as-is x2, edited, discarded, expired (the stale pending is 25 h old, within 14 days)
  });
});
