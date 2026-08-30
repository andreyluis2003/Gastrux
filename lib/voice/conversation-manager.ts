// @ts-nocheck
/**
 * Gerencia a conversa do agente de voz.
 * Usa LLM (Abacus.AI) para detectar intent + extrair dados da reserva.
 */

import type { AgentDecision, ReservationDraft, TranscriptTurn } from './types';

export interface ConversationContext {
  restaurantName: string;
  greeting: string;
  goodbye: string;
  outsideHoursMessage: string;
  allowReservations: boolean;
  allowTransfer: boolean;
  transferMessage: string;
  maxPartySize: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  businessHours?: any;
  currentDraft?: ReservationDraft;
  transcript: TranscriptTurn[];
}

const SYSTEM_PROMPT = (ctx: ConversationContext) => `Você é a recepcionista virtual do restaurante "${ctx.restaurantName}".
Sua missão é atender ligações em PORTUGUÊS DO BRASIL de forma cordial, breve e natural.

REGRAS CRÍTICAS:
- Responda SEMPRE em pt-BR, informal mas educado (trata por "você").
- Frases curtas (máx 2 sentenças por resposta). Essa resposta será falada por TTS em voz alta.
- Nunca invente disponibilidade; se não souber, diga que vai verificar e pergunte dados para retornar.
- Capacidades disponíveis: ${ctx.allowReservations ? 'fazer reservas' : ''}${ctx.allowTransfer ? ', transferir para humano se solicitado' : ''}, informações gerais (horário, localização).
- Para RESERVA: colete de forma natural (1 por vez se possível): quantidade de pessoas (max ${ctx.maxPartySize}), data, horário, nome do responsável. Telefone é opcional (já temos do caller).
- Confirme sempre os dados antes de finalizar ("Então seria uma reserva para X pessoas no dia Y às Z horas em nome de W, confere?").
- Só marque ready=true depois que o cliente CONFIRMAR.
- Se o cliente quiser falar com humano, marque intent=TRANSFER.
- Se a conversa estiver pronta para encerrar (após confirmar reserva ou despedida), marque endCall=true.
- Se o cliente pedir cancelamento de reserva, marque intent=CANCEL_RESERVATION (não implementado, diga para ligar mais tarde).

RETORNE SEMPRE JSON VÁLIDO no seguinte formato (sem markdown, sem \`\`\`):
{
  "intent": "RESERVATION" | "INFO" | "TRANSFER" | "CANCEL_RESERVATION" | "HANGUP" | "UNCLEAR",
  "reply": "<o que falar (pt-BR, curto)>",
  "draft": { "partySize": N?, "date": "YYYY-MM-DD"?, "time": "HH:MM"?, "name": "string"?, "notes": "string"? },
  "ready": boolean,
  "endCall": boolean
}

Contexto da conversa (rascunho atual da reserva): ${JSON.stringify(ctx.currentDraft || {})}
Data/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

function transcriptToMessages(transcript: TranscriptTurn[]) {
  return transcript.map((t) => ({
    role: t.role === 'agent' ? 'assistant' : 'user',
    content: t.text,
  }));
}

export async function decideNextReply(
  userUtterance: string,
  ctx: ConversationContext,
): Promise<AgentDecision> {
  // Sem API key → fallback regex simples
  if (!process.env.ABACUSAI_API_KEY) {
    return fallbackDecide(userUtterance, ctx);
  }

  const systemPrompt = SYSTEM_PROMPT(ctx);
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...transcriptToMessages(ctx.transcript),
    { role: 'user' as const, content: userUtterance },
  ];

  try {
    const resp = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      console.error('[voice-ai] LLM error', await resp.text().catch(() => ''));
      return fallbackDecide(userUtterance, ctx);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Merge draft
    const mergedDraft = { ...(ctx.currentDraft || {}), ...(parsed.draft || {}) };

    return {
      intent: parsed.intent || 'UNCLEAR',
      reply: parsed.reply || 'Desculpe, pode repetir?',
      draft: mergedDraft,
      ready: !!parsed.ready,
      endCall: !!parsed.endCall,
    };
  } catch (err) {
    console.error('[voice-ai] exception', err);
    return fallbackDecide(userUtterance, ctx);
  }
}

/**
 * Fallback sem LLM. Não faz reservas sofisticadas, apenas ecoa e detecta palavras-chave.
 */
function fallbackDecide(utt: string, ctx: ConversationContext): AgentDecision {
  const u = utt.toLowerCase();
  if (u.includes('humano') || u.includes('atendente') || u.includes('pessoa')) {
    return {
      intent: 'TRANSFER',
      reply: ctx.transferMessage,
      endCall: false,
    };
  }
  if (u.includes('tchau') || u.includes('até logo') || u.includes('desligar')) {
    return { intent: 'HANGUP', reply: ctx.goodbye, endCall: true };
  }
  if (u.includes('reserva') || u.includes('mesa')) {
    return {
      intent: 'RESERVATION',
      reply: 'Claro! Para quantas pessoas e em que dia e horário você gostaria?',
      draft: ctx.currentDraft || {},
    };
  }
  return {
    intent: 'UNCLEAR',
    reply: 'Posso ajudar com uma reserva ou com informações do restaurante. Como posso te atender?',
  };
}

/**
 * Saudação inicial quando a ligação é atendida.
 */
export function buildGreeting(ctx: ConversationContext): string {
  return ctx.greeting;
}
