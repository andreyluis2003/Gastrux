// @ts-nocheck
/**
 * Suggested replies for the official number's conversations (spec 2026-11-09): one stored suggestion per
 * client message, regenerate, team topics, FAILED with cost, settle on send, 14-day stats.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { GET as listAll } from '../../../app/api/admin/agent-conversations/route';
import { POST as answer } from '../../../app/api/admin/agent-conversations/[phone]/route';
import { GET as getSuggestion, POST as postSuggestion } from '../../../app/api/admin/agent-conversations/[phone]/suggestion/route';
jest.mock('../../../lib/ai/client', () => ({ getAnthropic: jest.fn() }));
import { getAnthropic } from '../../../lib/ai/client';
jest.mock('../../../lib/agents/activation/signals', () => {
  const actual = jest.requireActual('../../../lib/agents/activation/signals');
  return { ...actual, loadActivationSignals: jest.fn(actual.loadActivationSignals) };
});
import { loadActivationSignals } from '../../../lib/agents/activation/signals';
jest.mock('../../../lib/agents/whatsapp/suggest', () => {
  const actual = jest.requireActual('../../../lib/agents/whatsapp/suggest');
  return { ...actual, getOrCreateSuggestion: jest.fn(actual.getOrCreateSuggestion), suggestionStats: jest.fn(actual.suggestionStats) };
});
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

  it('asks with room for the model to think before the reply (app 2026-11-12: cut at max_tokens)', async () => {
    await clientIn('quanto custa?', HOUR);
    const create = mockReply(sugestao('O Pro custa R$ 99'));
    const out = await getOrCreateSuggestion(key, { now });
    expect(out).toMatchObject({ state: 'ready', kind: 'SUGGESTION' });
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(4000);
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

  it('reopening after Descartar stays empty; regenerate makes a new one', async () => {
    await clientIn('oi', HOUR);
    const create = mockReply(sugestao('Olá!'));
    const a = await getOrCreateSuggestion(key, { now });
    await discardSuggestion(key, a.id, 'equipe');
    expect(await getOrCreateSuggestion(key, { now })).toEqual({ state: 'none' });
    expect(create).toHaveBeenCalledTimes(1);
    const b = await getOrCreateSuggestion(key, { now, regenerate: true, by: 'equipe' });
    expect(b.state).toBe('ready');
    expect(b.id).not.toBe(a.id);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('a failure loading the account signals → unavailable, nothing stored', async () => {
    await clientIn('oi', HOUR);
    const create = mockReply(sugestao('x'));
    (loadActivationSignals as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getOrCreateSuggestion(key, { now })).toEqual({ state: 'unavailable' });
    spy.mockRestore();
    expect(create).not.toHaveBeenCalled();
    expect(await prisma.agentReplySuggestion.count({ where: { phone: key } })).toBe(0);
  });

  it('regenerate without an AI client keeps the current draft', async () => {
    await clientIn('oi', HOUR);
    mockReply(sugestao('Olá!'));
    const a = await getOrCreateSuggestion(key, { now });
    (getAnthropic as jest.Mock).mockReturnValue(null);
    expect(await getOrCreateSuggestion(key, { now, regenerate: true, by: 'equipe' })).toEqual({ state: 'unavailable' });
    expect((await prisma.agentReplySuggestion.findUnique({ where: { id: a.id } })).outcome).toBe('pending');
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

  describe('routes', () => {
    const ADMIN = { user: { id: 'admin-x', email: 'equipe@gastrux.test', role: 'ADMIN' } };
    const realFetch = global.fetch;
    const jsonReq = (body: any) => new Request('http://x/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any;
    const ctx = (phone: string) => ({ params: { phone } });
    const getReq = () => new Request('http://x/x') as any;

    beforeEach(() => {
      process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN = 'tok';
      process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = 'platform-phone-id';
      (getServerSession as jest.Mock).mockResolvedValue(ADMIN);
      global.fetch = jest.fn(async () => new Response(JSON.stringify({ messages: [{ id: `wamid.out.${crypto.randomBytes(5).toString('hex')}` }] }), { status: 200 }));
    });
    afterEach(() => {
      global.fetch = realFetch;
      delete process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
    });

    it('non-admin gets 401/403 on the suggestion route', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect([401, 403]).toContain((await getSuggestion(getReq(), ctx(key))).status);
      expect([401, 403]).toContain((await postSuggestion(jsonReq({ action: 'regenerate' }), ctx(key))).status);
      (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u', email: 'u@x.test', role: 'OWNER' } });
      expect([401, 403]).toContain((await getSuggestion(getReq(), ctx(key))).status);
    });

    it('GET suggestion then answer with suggestionId marks sent_as_is', async () => {
      await clientIn('oi', HOUR);
      mockReply(sugestao('Olá, tudo bem? Posso ajudar.'));
      const res = await getSuggestion(getReq(), ctx(key));
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      const v = await res.json();
      expect(v).toMatchObject({ state: 'ready', kind: 'SUGGESTION' });
      const r = await answer(jsonReq({ text: 'Olá, tudo bem? Posso ajudar.', suggestionId: v.id }), ctx(key));
      expect(r.status).toBe(200);
      const row = await prisma.agentReplySuggestion.findUnique({ where: { id: v.id } });
      expect(row.outcome).toBe('sent_as_is');
      expect(row.sentMessageId).toBe((await r.json()).message.id);
    });

    it('a non-string suggestionId is ignored and the reply still succeeds', async () => {
      await clientIn('oi', HOUR);
      const r = await answer(jsonReq({ text: 'Olá!', suggestionId: 12345 }), ctx(key));
      expect(r.status).toBe(200);
    });

    it('GET suggestion never fails the screen', async () => {
      await clientIn('oi', HOUR);
      (getAnthropic as jest.Mock).mockImplementation(() => { throw new Error('boom'); });
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const res = await getSuggestion(getReq(), ctx(key));
      spy.mockRestore();
      expect(res.status).toBe(200);
      expect(['unavailable', 'ready']).toContain((await res.json()).state);
    });

    it('discard via POST marks discarded; bad input is 400', async () => {
      await clientIn('oi', HOUR);
      mockReply(sugestao('Olá!'));
      const v = await (await getSuggestion(getReq(), ctx(key))).json();
      const bad = await postSuggestion(jsonReq({ action: 'discard' }), ctx(key));
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: 'Sugestão inválida' });
      const unk = await postSuggestion(jsonReq({ action: 'nope' }), ctx(key));
      expect(unk.status).toBe(400);
      expect(await unk.json()).toEqual({ error: 'Ação inválida' });
      const ok = await postSuggestion(jsonReq({ action: 'discard', id: v.id }), ctx(key));
      expect(await ok.json()).toEqual({ ok: true });
      expect((await prisma.agentReplySuggestion.findUnique({ where: { id: v.id } })).outcome).toBe('discarded');
    });

    it('regenerate via POST returns a new view', async () => {
      await clientIn('oi', HOUR);
      mockReply(sugestao('Olá!'));
      const a = await (await getSuggestion(getReq(), ctx(key))).json();
      const b = await (await postSuggestion(jsonReq({ action: 'regenerate' }), ctx(key))).json();
      expect(b.state).toBe('ready');
      expect(b.id).not.toBe(a.id);
    });

    it('suggestion routes answer unavailable when getOrCreateSuggestion throws', async () => {
      (getOrCreateSuggestion as jest.Mock).mockRejectedValueOnce(new Error('relation does not exist'));
      (getOrCreateSuggestion as jest.Mock).mockRejectedValueOnce(new Error('relation does not exist'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const g = await getSuggestion(getReq(), ctx(key));
      const p = await postSuggestion(jsonReq({ action: 'regenerate' }), ctx(key));
      spy.mockRestore();
      expect(g.status).toBe(200);
      expect(await g.json()).toEqual({ state: 'unavailable' });
      expect(p.status).toBe(200);
      expect(await p.json()).toEqual({ state: 'unavailable' });
    });

    it('list GET survives a stats failure with suggestionStats null', async () => {
      (suggestionStats as jest.Mock).mockRejectedValueOnce(new Error('relation does not exist'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const res = await listAll();
      spy.mockRestore();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.suggestionStats).toBeNull();
      expect(Array.isArray(body.conversations)).toBe(true);
    });

    it('list GET returns suggestionStats', async () => {
      const body = await (await listAll()).json();
      expect(body.suggestionStats).toEqual(expect.objectContaining({ made: expect.any(Number), asIs: expect.any(Number), edited: expect.any(Number), discarded: expect.any(Number), team: expect.any(Number) }));
    });
  });
});
