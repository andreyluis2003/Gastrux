/**
 * Pure rules for the agent's suggested replies (spec 2026-11-09): which client messages are waiting, which
 * subjects stay with the team, parsing/validating the AI output, the "quase igual" criterion and the
 * prompts. No DB, no AI calls here.
 */
import { STAGES } from '@/lib/admin/client-health';
import { SEGMENTS } from '@/lib/marketing/segments';
import { WHATSAPP_MAX } from '../activation/writer';
import type { ActivationSignals } from '../activation/rules';

export type ReplyMessage = { id: string; direction: 'IN' | 'OUT'; text: string; messageType: string; createdAt: Date };
export type ParsedReply = { kind: 'SUGGESTION'; text: string } | { kind: 'TEAM'; reason: string } | null;
export type ClientContext = { kind: 'client'; signals: ActivationSignals; tier: string } | { kind: 'visitor' };

const DAY = 86_400_000;
const TEXT_TYPES = ['text', 'button', 'interactive'];
const NON_TEXT_REASON = 'Mensagem com áudio, foto ou documento';
const SIGNATURE = 'Equipe Gastrux';
const SIMILARITY_MAX_DISTANCE = 10;

/** The client messages (IN) after the last team message (OUT). Input is oldest-first. */
export function pendingClientMessages(messages: ReplyMessage[]): ReplyMessage[] {
  let lastOut = -1;
  messages.forEach((m, i) => { if (m.direction === 'OUT') lastOut = i; });
  return messages.slice(lastOut + 1).filter((m) => m.direction === 'IN');
}

/** Audio, photo or document among the pending messages: the AI cannot hear or see, so the team answers. */
export function nonTextReason(pending: ReplyMessage[]): string | null {
  return pending.some((m) => !TEXT_TYPES.includes(m.messageType)) ? NON_TEXT_REASON : null;
}

/** Parses `{"tipo":"sugestao","texto":...}` or `{"tipo":"equipe","motivo":...}`, with or without a ```json fence. */
export function parseReply(raw: string): ParsedReply {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  let data: unknown;
  try { data = JSON.parse(s); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.tipo === 'sugestao' && typeof d.texto === 'string') {
    const text = d.texto.trim();
    return text ? { kind: 'SUGGESTION', text } : null;
  }
  if (d.tipo === 'equipe' && typeof d.motivo === 'string') {
    const reason = d.motivo.trim();
    return reason ? { kind: 'TEAM', reason } : null;
  }
  return null;
}

/** True when the last non-empty line is the signature, ignoring case, trailing punctuation and emoji. */
function endsWithSignature(t: string): boolean {
  const last = t.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  return last.replace(/[^\p{L}\p{N}]+$/u, '').toLowerCase() === SIGNATURE.toLowerCase();
}

/** Non-empty, within the WhatsApp limit, at most one link (to gastrux.com or a subdomain), no signature. */
export function validReplyText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > WHATSAPP_MAX) return false;
  if (endsWithSignature(t)) return false;
  const links = t.match(/https?:\/\/[^\s]+/gi) ?? [];
  if (links.length > 1) return false;
  for (const raw of links) {
    const link = raw.replace(/[.,;:!?)\]}"'”]+$/, '');
    const host = link.match(/^https?:\/\/([^/\s?#:]+)/i)?.[1].toLowerCase().replace(/\.$/, '');
    if (!host || !(host === 'gastrux.com' || host.endsWith('.gastrux.com'))) return false;
  }
  return true;
}

const normalise = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The "quase igual" criterion for a sent reply versus the suggestion: the two are the same when, after
 * trimming, collapsing whitespace and lowercasing, they are equal or at most 10 single-character edits
 * apart (Levenshtein). So only spaces/case or a corrected name counts as unchanged; a rewritten
 * sentence counts as an edit.
 */
export function sameEnough(suggested: string, sent: string): boolean {
  const a = normalise(suggested);
  const b = normalise(sent);
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > SIMILARITY_MAX_DISTANCE) return false;
  return levenshtein(a, b) <= SIMILARITY_MAX_DISTANCE;
}

export function replySystemPrompt(knowledge: string): string {
  return [
    'Você sugere a resposta da equipe Gastrux (sistema de gestão para restaurantes) a uma mensagem recebida no WhatsApp oficial do Gastrux. Quem escreve é um dono de restaurante, cliente ou interessado. Um humano revisa e envia.',
    'Regras da resposta:',
    '- Português do Brasil, tom de conversa de WhatsApp: simples, caloroso, direto, sem jargão. Use emoji só se o cliente usou.',
    `- No máximo ${WHATSAPP_MAX} caracteres.`,
    '- Responda exatamente o que foi perguntado. Se for levar a uma tela, no máximo um link, e só do Gastrux (gastrux.com).',
    '- Só cite funções, preços e regras que estão no conhecimento abaixo. Se não souber, responda tipo equipe com o motivo; nunca invente.',
    `- Não termine com assinatura "${SIGNATURE}": é uma conversa, e o número já aparece como Gastrux.`,
    '- Nunca prometa prazo de correção, desconto, mais dias de teste, cancelamento ou devolução de dinheiro.',
    'Assuntos que ficam com a equipe (não escreva resposta; responda tipo equipe com o motivo em uma linha):',
    '- cobrança, pagamento, cancelamento, devolução de dinheiro, nota fiscal da assinatura;',
    '- erro, defeito ou algo que "não funciona" no sistema (precisa de alguém olhar);',
    '- reclamação ou cliente irritado;',
    '- pedido de dados pessoais, LGPD, apagar conta;',
    '- dúvida fiscal ou jurídica do restaurante que vá além do que o conhecimento explica;',
    '- mensagem que não é texto (áudio, foto, documento).',
    'Formato: responda só com o JSON, sem texto fora dele. Ou {"tipo":"sugestao","texto":"..."} ou {"tipo":"equipe","motivo":"..."}.',
    '',
    'Conhecimento do produto:\n' + knowledge,
  ].join('\n');
}

const TZ = 'America/Sao_Paulo';
const stamp = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
};

const segmentName = (slug: string | null) => (slug ? SEGMENTS.find((x) => x.slug === slug)?.shortName ?? slug : 'não informado');

function contextLines(ctx: ClientContext, now: Date): string[] {
  if (ctx.kind === 'visitor') {
    return [
      'Quem escreve não tem conta no Gastrux (visitante). Se fizer sentido, apresente o Gastrux e leve ao cadastro em https://gastrux.com: 30 dias grátis, sem cartão.',
    ];
  }
  const s = ctx.signals;
  const required = s.steps.filter((x) => !x.optional);
  const next = s.steps.find((x) => !x.done && !x.optional) ?? s.steps.find((x) => !x.done);
  return [
    `Nome do dono: ${(s.ownerName || '').trim().split(/\s+/)[0] || 'não informado'}.`,
    `Restaurante: ${s.restaurantName}. Tipo de negócio: ${segmentName(s.businessType)}.`,
    `Dias desde o cadastro: ${Math.floor((now.getTime() - s.createdAt.getTime()) / DAY)}. Etapa: ${STAGES.find((x) => x.value === s.stage)?.label ?? s.stage}.`,
    `Plano: ${ctx.tier}. Passos feitos: ${s.stepsDone} de ${required.length}.`,
    `Próximo passo: ${next?.label ?? 'nenhum pendente'}.`,
  ];
}

export function replyUserPrompt(ctx: ClientContext, last20: ReplyMessage[], now: Date): string {
  return [
    ...contextLines(ctx, now),
    '',
    'Conversa (mais antiga primeiro):',
    ...last20.map((m) => `[${stamp(m.createdAt)}] ${m.direction === 'IN' ? 'Cliente' : 'Equipe'}: ${m.text}`),
  ].join('\n');
}
