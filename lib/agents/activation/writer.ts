/**
 * Writes the activation agent's messages (spec 2026-10-27). The rules decided when and why; the AI only
 * drafts the text, with the onboarding knowledge and the account's context. A draft that breaks a rule
 * (too long, no link, no signature) or an AI error falls back to the fixed template, so a message is
 * always ready for the approval queue. Owner alerts are internal and always use the fixed text.
 */
import { getAnthropic } from '@/lib/ai/client';
import { aiModels, estimateCostUsd } from '@/lib/ai/config';
import implantacao from '@/lib/ai/knowledge/implantacao';
import videos from '@/lib/ai/knowledge/videos';
import { SEGMENTS } from '@/lib/marketing/segments';
import { TRIGGER_LABELS, type ActivationDecision, type ActivationSignals } from './rules';
import { templateFor, type ClientChannel, type TemplateContext } from './templates';

export { templateFor } from './templates';

export type AgentChannelName = ClientChannel | 'OWNER_ALERT';
export const WHATSAPP_MAX = 700;
const DAY = 86_400_000;

const appUrl = () => (process.env.NEXTAUTH_URL || 'https://gastrux.com').replace(/\/$/, '');

function contextFor(s: ActivationSignals, d: ActivationDecision): TemplateContext {
  const path = d.nextStep?.href ?? (['fim_teste_vendendo', 'o_que_faltou'].includes(d.trigger) ? '/pricing' : '/dashboard');
  return {
    firstName: (s.ownerName || '').trim().split(/\s+/)[0] || null,
    restaurantName: s.restaurantName,
    link: `${appUrl()}${path}`,
    stepLabel: d.nextStep?.label ?? null,
  };
}

const segmentName = (slug: string | null) => (slug ? SEGMENTS.find((x) => x.slug === slug)?.shortName ?? slug : 'não informado');

function system(channel: ClientChannel): string {
  return [
    'Você escreve, em nome da Equipe Gastrux, uma mensagem curta para o dono de um restaurante que está testando o Gastrux (sistema de gestão para restaurantes).',
    'Regras:',
    '- Português do Brasil, tom simples e caloroso, sem jargão, sem emojis em excesso.',
    '- Um só próximo passo e exatamente um link: use o link dado, sem alterar.',
    '- Nunca ofereça desconto, mais dias de teste, cancelamento ou cobrança.',
    '- Só cite funções que aparecem no conhecimento abaixo; nunca prometa nada fora dele.',
    '- Termine com a assinatura "Equipe Gastrux" na última linha.',
    channel === 'WHATSAPP'
      ? `- É uma mensagem de WhatsApp: no máximo ${WHATSAPP_MAX - 100} caracteres.`
      : '- É um e-mail: a primeira linha é "Assunto: <assunto>", depois uma linha em branco e o texto (até 120 palavras).',
    '- Responda só com a mensagem.',
    '',
    'Conhecimento do produto:',
    implantacao,
    videos,
  ].join('\n');
}

function prompt(s: ActivationSignals, d: ActivationDecision, ctx: TemplateContext, now: Date): string {
  const total = s.steps.filter((x) => !x.optional).length;
  return [
    `Motivo da mensagem: ${TRIGGER_LABELS[d.trigger]} (${d.reason}).`,
    `Restaurante: ${s.restaurantName}. Tipo de negócio: ${segmentName(s.businessType)}.`,
    `Nome do dono: ${ctx.firstName ?? 'não informado'}.`,
    `Dias desde o cadastro: ${Math.floor((now.getTime() - s.createdAt.getTime()) / DAY)}. Passos feitos: ${s.stepsDone} de ${total}.`,
    `Próximo passo: ${ctx.stepLabel ?? 'escolher um plano'}. Link: ${ctx.link}`,
  ].join('\n');
}

function ownerAlert(s: ActivationSignals, d: ActivationDecision, now: Date): { subject: string; text: string } {
  const days = Math.floor((now.getTime() - s.createdAt.getTime()) / DAY);
  const total = s.steps.filter((x) => !x.optional).length;
  const suggestion = templateFor(d.trigger, 'WHATSAPP', contextFor(s, d)).text;
  return {
    subject: `${TRIGGER_LABELS[d.trigger]}: ${s.restaurantName}`,
    text: [
      `${s.restaurantName}: ${d.reason}.`,
      `Cadastro há ${days} dias. Passos feitos: ${s.stepsDone} de ${total}.`,
      `Dono: ${s.ownerName ?? 'sem nome'}${s.whatsapp ? `, WhatsApp ${s.whatsapp}` : ''}${s.email ? `, ${s.email}` : ''}.`,
      '',
      'Mensagem sugerida:',
      suggestion,
    ].join('\n'),
  };
}

function valid(text: string, channel: ClientChannel, link: string): boolean {
  if (!text.includes(link) || !text.trim().endsWith('Equipe Gastrux')) return false;
  if ((text.match(/https?:\/\//g) ?? []).length !== 1) return false;
  return channel !== 'WHATSAPP' || text.length <= WHATSAPP_MAX;
}

export async function writeActivationMessage(
  s: ActivationSignals,
  d: ActivationDecision,
  channel: AgentChannelName,
  now = new Date(),
): Promise<{ subject: string | null; text: string; costUsd: number }> {
  if (channel === 'OWNER_ALERT') return { ...ownerAlert(s, d, now), costUsd: 0 };

  const ctx = contextFor(s, d);
  const fallback = { ...templateFor(d.trigger, channel, ctx), costUsd: 0 };
  const client = getAnthropic();
  if (!client) return fallback;

  try {
    const model = aiModels().default;
    const res = await client.messages.create({
      model,
      max_tokens: 600,
      system: system(channel),
      messages: [{ role: 'user', content: prompt(s, d, ctx, now) }],
    });
    const costUsd = estimateCostUsd(model, res.usage);
    let text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
    let subject: string | null = null;
    if (channel === 'EMAIL') {
      const m = text.match(/^Assunto:\s*(.+)\n+/);
      if (!m) return { ...fallback, costUsd };
      subject = m[1].trim();
      text = text.slice(m[0].length).trim();
    }
    if (!valid(text, channel, ctx.link)) return { ...fallback, costUsd };
    return { subject, text, costUsd };
  } catch {
    return fallback;
  }
}
