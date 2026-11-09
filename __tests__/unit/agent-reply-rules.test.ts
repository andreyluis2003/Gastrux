/**
 * Pure rules for the agent's suggested replies (spec 2026-11-09): which messages are pending, which
 * subjects go to the team, parsing and validating the AI output, the "quase igual" criterion, and prompts.
 */
import {
  pendingClientMessages, nonTextReason, parseReply, validReplyText, sameEnough,
  replySystemPrompt, replyUserPrompt, type ReplyMessage,
} from '../../lib/agents/whatsapp/reply-rules';
import type { ActivationSignals } from '../../lib/agents/activation/rules';

let seq = 0;
function msg(direction: 'IN' | 'OUT', text: string, messageType = 'text'): ReplyMessage {
  seq += 1;
  // 2026-11-09 15:00Z + seq minutes = 12:0x in America/Sao_Paulo
  return { id: `m${seq}`, direction, text, messageType, createdAt: new Date(Date.UTC(2026, 10, 9, 15, seq)) };
}

const now = new Date('2026-11-09T18:00:00Z');
const DAY = 86_400_000;
const signals: ActivationSignals = {
  restaurantId: 'r1', restaurantName: 'Pizzaria da Maria', ownerId: 'u1', ownerName: 'Maria Silva',
  email: 'maria@x.test', whatsappConsent: true, whatsapp: '5566999998888', businessType: 'pizzaria', timezone: 'America/Cuiaba',
  createdAt: new Date(now.getTime() - 3 * DAY), trialEndsAt: new Date(now.getTime() + 3 * DAY), status: 'TRIAL', stage: 'SIGNED_UP',
  lastActivityAt: null, firstSaleAt: null,
  steps: [
    { key: 'cardapio', label: 'Cadastrar seus produtos e preços', href: '/admin/cardapio', done: false },
    { key: 'caixa', label: 'Abrir o caixa', href: '/vender', done: true },
  ],
  stepsDone: 1, excluded: false, sent: [],
};

describe('pendingClientMessages', () => {
  it('returns the IN messages after the last OUT', () => {
    const m = [msg('IN', 'oi'), msg('OUT', 'olá'), msg('IN', 'quanto custa?'), msg('IN', 'o Pro')];
    expect(pendingClientMessages(m).map((x) => x.text)).toEqual(['quanto custa?', 'o Pro']);
  });
  it('is empty when the last message is the team\'s', () => {
    expect(pendingClientMessages([msg('IN', 'oi'), msg('OUT', 'olá')])).toEqual([]);
  });
});

it('nonTextReason: audio/image/document go to the team', () => {
  expect(nonTextReason([msg('IN', '[audio]', 'audio')])).toBe('Mensagem com áudio, foto ou documento');
  expect(nonTextReason([msg('IN', 'Sim', 'button')])).toBeNull();
  expect(nonTextReason([msg('IN', 'x', 'interactive')])).toBeNull();
});

describe('parseReply', () => {
  it('suggestion', () => expect(parseReply('{"tipo":"sugestao","texto":"O Pro custa..."}')).toEqual({ kind: 'SUGGESTION', text: 'O Pro custa...' }));
  it('team', () => expect(parseReply('```json\n{"tipo":"equipe","motivo":"Pedido de cancelamento"}\n```')).toEqual({ kind: 'TEAM', reason: 'Pedido de cancelamento' }));
  it('prose or wrong shape → null', () => {
    expect(parseReply('Claro! Aqui vai: oi')).toBeNull();
    expect(parseReply('{"tipo":"sugestao"}')).toBeNull();
    expect(parseReply('{"tipo":"sugestao","texto":"   "}')).toBeNull();
    expect(parseReply('{"tipo":"equipe","motivo":""}')).toBeNull();
    expect(parseReply('{"tipo":"outro","texto":"x"}')).toBeNull();
  });
  it('trims fields', () => expect(parseReply('{"tipo":"sugestao","texto":"  oi  "}')).toEqual({ kind: 'SUGGESTION', text: 'oi' }));
});

describe('validReplyText', () => {
  it('accepts one gastrux link (any case, subdomain) and no link', () => {
    expect(validReplyText('Cadastre em https://gastrux.com')).toBe(true);
    expect(validReplyText('Veja https://App.Gastrux.com/pricing')).toBe(true);
    expect(validReplyText('Acesse gastrux.com e veja')).toBe(true);
  });
  it('rejects >700, two links, other hosts, http other host, signature, empty', () => {
    expect(validReplyText('a'.repeat(701))).toBe(false);
    expect(validReplyText('https://gastrux.com e https://gastrux.com/pricing')).toBe(false);
    expect(validReplyText('veja https://outro.com')).toBe(false);
    expect(validReplyText('veja http://outro.com')).toBe(false);
    expect(validReplyText('veja https://gastrux.com.evil.com')).toBe(false);
    expect(validReplyText('Oi!\n\nEquipe Gastrux')).toBe(false);
    expect(validReplyText('   ')).toBe(false);
  });
});

describe('sameEnough', () => {
  it('spaces/case only, or a corrected name, is the same', () => {
    expect(sameEnough('Oi, Maria!  O Pro custa R$ 99.', 'oi, maria! o pro custa r$ 99.')).toBe(true);
    expect(sameEnough('Oi, Maria! O Pro custa R$ 99.', 'Oi, Mariana! O Pro custa R$ 99.')).toBe(true);
  });
  it('a rewritten sentence is an edit', () => expect(sameEnough('O Pro custa R$ 99 por mês.', 'Te mando os planos agora, um momento.')).toBe(false));
});

describe('replyUserPrompt', () => {
  it('client: names, stage, plan, steps, next step, transcript with dates', () => {
    const p = replyUserPrompt({ kind: 'client', signals, tier: 'business' }, [msg('IN', 'oi'), msg('OUT', 'olá, tudo bem?')], now);
    expect(p).toContain('Pizzaria da Maria');
    expect(p).toContain('Maria');
    expect(p).toContain('Passos feitos: 1 de');
    expect(p).toContain('Cadastrar seus produtos e preços');
    expect(p).toContain('Plano: business');
    expect(p).toContain('Cadastrou');
    expect(p).toContain('09/11');
    expect(p).toContain('Cliente: oi');
    expect(p).toContain('Equipe: olá, tudo bem?');
    expect(p).toContain('Conversa (mais antiga primeiro):');
  });
  it('visitor: says there is no account and to pitch https://gastrux.com, 30 dias grátis, sem cartão', () => {
    const p = replyUserPrompt({ kind: 'visitor' }, [msg('IN', 'oi')], now);
    expect(p).toContain('https://gastrux.com');
    expect(p).toContain('30 dias grátis');
    expect(p).toContain('sem cartão');
  });
});

it('replySystemPrompt holds every rule and the knowledge at the end', () => {
  const s = replySystemPrompt('KNOW');
  for (const t of ['700', 'gastrux.com', 'Equipe Gastrux', 'desconto', 'cancelamento', 'LGPD', '"tipo":"equipe"', '"tipo":"sugestao"']) expect(s).toContain(t);
  expect(s.trim().endsWith('KNOW')).toBe(true);
});
