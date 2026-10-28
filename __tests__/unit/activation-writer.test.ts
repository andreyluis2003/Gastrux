/**
 * The activation agent's text (spec 2026-10-27): the AI drafts it, and a fixed template is used when
 * the AI is off, fails, or breaks the rules (too long, no link, no signature).
 */
jest.mock('../../lib/ai/client', () => ({ getAnthropic: jest.fn() }));
import { getAnthropic } from '../../lib/ai/client';
import { templateFor, writeActivationMessage } from '../../lib/agents/activation/writer';
import type { ActivationDecision, ActivationSignals, ActivationTrigger } from '../../lib/agents/activation/rules';

const DAY = 86_400_000;
const now = new Date('2026-10-28T15:00:00Z');
const cardapio = { key: 'cardapio' as const, label: 'Cadastrar seus produtos e preços', href: '/admin/cardapio', done: false };

const signals: ActivationSignals = {
  restaurantId: 'r1', restaurantName: 'Pizzaria da Maria', ownerId: 'u1', ownerName: 'Maria Silva',
  email: 'maria@x.test', whatsapp: '5566999998888', businessType: 'pizzaria', timezone: 'America/Cuiaba',
  createdAt: new Date(now.getTime() - 3 * DAY), trialEndsAt: new Date(now.getTime() + 3 * DAY), status: 'TRIAL', stage: 'SIGNED_UP',
  lastActivityAt: null, steps: [cardapio, { key: 'caixa', label: 'Abrir o caixa', href: '/vender', done: true }], stepsDone: 1,
  excluded: false, sent: [],
};
const decision: ActivationDecision = { trigger: 'cardapio_parado', reason: 'Ainda não cadastrou os produtos', ownerAlert: false, nextStep: cardapio };

const ALL: ActivationTrigger[] = ['boas_vindas', 'cardapio_parado', 'sem_caixa', 'sem_venda', 'sumiu', 'primeira_venda', 'fim_teste_vendendo', 'fim_teste_sem_venda', 'travou', 'o_que_faltou'];

function mockReply(text: string) {
  const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 200 } });
  (getAnthropic as jest.Mock).mockReturnValue({ messages: { create } });
  return create;
}

beforeEach(() => (getAnthropic as jest.Mock).mockReset());

describe('templates', () => {
  it.each(ALL)('%s: first name, one link, signature; WhatsApp within 700 characters', (trigger) => {
    const ctx = { firstName: 'Maria', restaurantName: 'Pizzaria da Maria', link: 'https://gastrux.com/admin/cardapio', stepLabel: 'Cadastrar seus produtos e preços' };
    for (const channel of ['EMAIL', 'WHATSAPP'] as const) {
      const t = templateFor(trigger, channel, ctx);
      expect(t.text).toContain('Maria');
      expect(t.text.match(/https:\/\//g)).toHaveLength(1);
      expect(t.text.trim().endsWith('Equipe Gastrux')).toBe(true);
      if (channel === 'WHATSAPP') expect(t.text.length).toBeLessThanOrEqual(700);
      if (channel === 'EMAIL') expect(t.subject).toBeTruthy();
    }
  });

  it('o_que_faltou asks one question', () => {
    const t = templateFor('o_que_faltou', 'WHATSAPP', { firstName: 'Maria', restaurantName: 'X', link: 'https://gastrux.com/pricing', stepLabel: null });
    expect(t.text).toContain('O que faltou para o Gastrux servir para você?');
  });
});

describe('writeActivationMessage', () => {
  it('without the AI: the template, no cost, the step link', async () => {
    (getAnthropic as jest.Mock).mockReturnValue(null);
    const m = await writeActivationMessage(signals, decision, 'WHATSAPP');
    expect(m.costUsd).toBe(0);
    expect(m.subject).toBeNull();
    expect(m.text).toContain('Maria');
    expect(m.text).toContain('https://gastrux.com/admin/cardapio');
    expect(m.text.trim().endsWith('Equipe Gastrux')).toBe(true);
    const email = await writeActivationMessage(signals, decision, 'EMAIL');
    expect(email.subject).toBeTruthy();
  });

  it('with the AI: the prompt carries the reason, the business type and the next step; the reply is used', async () => {
    const reply = 'Oi, Maria! Que tal cadastrar os produtos hoje? https://gastrux.com/admin/cardapio\n\nEquipe Gastrux';
    const create = mockReply(reply);
    const m = await writeActivationMessage(signals, decision, 'WHATSAPP');
    const sent = JSON.stringify(create.mock.calls[0][0]);
    expect(sent).toContain('Ainda não cadastrou os produtos');
    expect(sent).toContain('Pizzaria');
    expect(sent).toContain('Cadastrar seus produtos e preços');
    expect(m.text).toBe(reply);
    expect(m.costUsd).toBeGreaterThan(0);
  });

  it('an e-mail reply gives the subject from its first line', async () => {
    mockReply('Assunto: Seu cardápio em 5 minutos\n\nOi, Maria! https://gastrux.com/admin/cardapio\n\nEquipe Gastrux');
    const m = await writeActivationMessage(signals, decision, 'EMAIL');
    expect(m.subject).toBe('Seu cardápio em 5 minutos');
    expect(m.text.startsWith('Oi, Maria!')).toBe(true);
  });

  it('a WhatsApp reply over 700 characters falls back to the template', async () => {
    mockReply(`Oi, Maria! ${'x'.repeat(700)} https://gastrux.com/admin/cardapio\n\nEquipe Gastrux`);
    const m = await writeActivationMessage(signals, decision, 'WHATSAPP');
    expect(m.text.length).toBeLessThanOrEqual(700);
    expect(m.text).toBe(templateFor('cardapio_parado', 'WHATSAPP', { firstName: 'Maria', restaurantName: 'Pizzaria da Maria', link: 'https://gastrux.com/admin/cardapio', stepLabel: cardapio.label }).text);
  });

  it('a reply without the link falls back to the template', async () => {
    mockReply('Oi, Maria! Cadastre os produtos.\n\nEquipe Gastrux');
    expect((await writeActivationMessage(signals, decision, 'WHATSAPP')).text).toContain('https://gastrux.com/admin/cardapio');
  });

  it('an AI error falls back to the template', async () => {
    (getAnthropic as jest.Mock).mockReturnValue({ messages: { create: jest.fn().mockRejectedValue(new Error('overloaded')) } });
    const m = await writeActivationMessage(signals, decision, 'WHATSAPP');
    expect(m.text).toContain('https://gastrux.com/admin/cardapio');
    expect(m.costUsd).toBe(0);
  });

  it('an owner alert names the restaurant, the days, the steps and a suggested message', async () => {
    const create = mockReply('ignored');
    const alert = await writeActivationMessage(signals, { trigger: 'fim_teste_sem_venda', reason: 'O teste acaba em até 4 dias e ainda não houve venda', ownerAlert: true, nextStep: cardapio }, 'OWNER_ALERT', now);
    expect(create).not.toHaveBeenCalled();
    expect(alert.subject).toContain('Pizzaria da Maria');
    expect(alert.text).toContain('Pizzaria da Maria');
    expect(alert.text).toContain('3 dias');
    expect(alert.text).toContain('1 de 2');
    expect(alert.text).toContain('Mensagem sugerida');
  });
});
