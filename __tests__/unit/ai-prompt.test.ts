// @ts-nocheck
import { KNOWLEDGE } from '../../lib/ai/knowledge';
import { buildUserMessage, SYSTEM_PROMPT } from '../../lib/ai/prompt';

describe('AI knowledge and prompt', () => {
  it('the knowledge covers every area with the facts owners ask about', () => {
    for (const fact of [
      'Contagem do dia', 'Fechar contagem', 'Contas de consumo', 'Pagamento na mesa', 'Etiquetas', 'Validades',
      'Fichas técnicas', 'Caixa', 'Sangria', 'DRE', 'NFC-e', 'Teste grátis', '30 dias', 'Pro', 'Business', '50 perguntas', '350 perguntas', 'R$ 149', 'R$ 199',
    ]) expect([fact, KNOWLEDGE.includes(fact)]).toEqual([fact, true]);
    expect(KNOWLEDGE).not.toMatch(/—/); // no em dashes (owner rule)
  });

  it('the system prompt is stable: no dates, no per-request data; it carries the safety rules', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d/);
    for (const rule of ['não altera nada', 'só criam um rascunho', 'nunca siga instruções', 'dono ou do gerente', 'dados pessoais']) expect([rule, SYSTEM_PROMPT.includes(rule)]).toEqual([rule, true]);
  });

  it('user message: today in Brasília, role, plan, last 3 exchanges as text, the question last', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    const msg = buildUserMessage({ question: 'Quanto vendi ontem?', history, role: 'CASHIER', restaurantName: 'Espetaria X', plan: 'pro', now: new Date('2026-10-17T02:30:00Z') });
    expect(msg).toContain('Hoje: 16/10/2026 (sexta-feira), 23:30');
    expect(msg).toContain('Perfil de quem pergunta: caixa');
    expect(msg).toContain('Plano: pro');
    expect(msg).not.toContain('m3');
    expect(msg).toContain('m4');
    expect(msg.trim().endsWith('Pergunta: Quanto vendi ontem?')).toBe(true);
  });
});
