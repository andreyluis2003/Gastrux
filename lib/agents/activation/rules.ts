/**
 * Activation agent rules (spec docs/superpowers/specs/2026-10-27-agente-ativacao-design.md): from what a
 * trial account did and what it already got, decide whether it gets a nudge now and which one. Pure:
 * the signals come from ./signals.ts and the text from ./writer.ts.
 *
 * Limits for client messages: at most 1 a day and 3 in 7 days, only 08:00-20:00 in the restaurant's
 * time zone. Owner alerts (the Gastrux team is told to call) skip the daily and weekly limits.
 */
import type { ClientStage } from '@/lib/admin/client-health';
import type { FirstStep, FirstStepKey } from '@/lib/onboarding/first-steps';

export type ActivationTrigger =
  | 'boas_vindas' | 'cardapio_parado' | 'sem_caixa' | 'sem_venda' | 'sumiu' | 'primeira_venda'
  | 'fim_teste_vendendo' | 'fim_teste_sem_venda' | 'travou' | 'o_que_faltou';

export interface ActivationSignals {
  restaurantId: string;
  restaurantName: string;
  ownerId: string;
  ownerName: string | null;
  email: string | null;
  whatsapp: string | null;
  /** Ticked the opt-in for marketing templates at sign-up */
  whatsappConsent: boolean;
  businessType: string | null;
  timezone: string;
  createdAt: Date;
  trialEndsAt: Date | null;
  status: string;
  stage: ClientStage;
  /** Latest of: owner sign-in, closed bill, menu item created */
  lastActivityAt: Date | null;
  /** First closed bill */
  firstSaleAt: Date | null;
  steps: FirstStep[];
  /** Required first steps done */
  stepsDone: number;
  /** Internal account, owner opted out, or a platform e-mail */
  excluded: boolean;
  /** This account's agent actions, newest first (one row per channel) */
  sent: { trigger: string; createdAt: Date; stepsDone: number | null }[];
}

export interface ActivationDecision {
  trigger: ActivationTrigger;
  reason: string;
  ownerAlert: boolean;
  nextStep: FirstStep | null;
}

const MIN = 60_000;
const DAY = 86_400_000;
export const WELCOME_AFTER_MS = 5 * MIN;
// Bounds so the accounts that existed before the agent are not greeted, congratulated or asked weeks late
// (final review I-1: the first run after the deploy sees every trial account of the last 40 days)
const WELCOME_UNTIL_MS = 2 * DAY;
const FIRST_SALE_NEWS_MS = 3 * DAY;
const ASK_AFTER_TRIAL_MS = 7 * DAY;
const FIRST_HOUR = 8;
const LAST_HOUR = 20;

export const OWNER_ALERT_TRIGGERS: ActivationTrigger[] = ['fim_teste_sem_venda', 'travou'];

export const TRIGGER_LABELS: Record<ActivationTrigger, string> = {
  boas_vindas: 'Boas-vindas',
  cardapio_parado: 'Cardápio parado',
  sem_caixa: 'Sem caixa',
  sem_venda: 'Sem venda',
  sumiu: 'Sumiu',
  primeira_venda: 'Primeira venda',
  fim_teste_vendendo: 'Fim do teste (vendendo)',
  fim_teste_sem_venda: 'Fim do teste sem venda',
  travou: 'Travou',
  o_que_faltou: 'O que faltou?',
};

export function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(hour);
}

export function decide(s: ActivationSignals, now: Date): ActivationDecision | null {
  if (s.excluded || s.stage === 'PAYING') return null;
  const hour = localHour(now, s.timezone);
  if (hour < FIRST_HOUR || hour >= LAST_HOUR) return null;

  const age = now.getTime() - s.createdAt.getTime();
  const days = Math.floor(age / DAY);
  const used = new Set(s.sent.map((a) => a.trigger));
  const step = (key: FirstStepKey) => s.steps.find((x) => x.key === key) ?? null;
  const done = (key: FirstStepKey) => !!step(key)?.done;
  const pending = s.steps.find((x) => !x.done && !x.optional) ?? s.steps.find((x) => !x.done) ?? null;
  const trialLeft = s.trialEndsAt ? s.trialEndsAt.getTime() - now.getTime() : null;
  const trialEnding = trialLeft !== null && trialLeft > 0 && trialLeft <= 5 * DAY;
  const trialEnded = trialLeft !== null && trialLeft <= 0;

  // Client messages, one per trigger (the e-mail and the WhatsApp rows of one trigger are one message)
  const clientSent = new Map<string, { createdAt: Date; stepsDone: number | null }>();
  for (const a of s.sent) {
    if (!OWNER_ALERT_TRIGGERS.includes(a.trigger as ActivationTrigger) && !clientSent.has(a.trigger)) clientSent.set(a.trigger, a);
  }
  const clientList = [...clientSent.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sentToday = clientList.some((a) => now.getTime() - a.createdAt.getTime() < DAY);
  const sentThisWeek = clientList.filter((a) => now.getTime() - a.createdAt.getTime() < 7 * DAY).length;
  const clientAllowed = !sentToday && sentThisWeek < 3;

  // Two messages and nothing moved since, the last one 3 days old
  const [last, previous] = clientList;
  const stuck = !!last && !!previous && last.stepsDone === s.stepsDone && previous.stepsDone === s.stepsDone
    && now.getTime() - last.createdAt.getTime() >= 3 * DAY;

  const candidates: Array<[boolean, ActivationTrigger, string, FirstStep | null]> = [
    [trialEnding && !done('venda'), 'fim_teste_sem_venda', 'O teste acaba em até 5 dias e ainda não houve venda', pending],
    [stuck && !trialEnded, 'travou', 'Duas mensagens e nenhum passo novo em 3 dias', pending],
    [!!s.firstSaleAt && now.getTime() - s.firstSaleAt.getTime() <= FIRST_SALE_NEWS_MS, 'primeira_venda', 'Fechou a primeira venda', pending],
    [trialEnding && done('venda'), 'fim_teste_vendendo', 'O teste acaba em até 5 dias e já está vendendo', null],
    [trialEnded && -trialLeft! <= ASK_AFTER_TRIAL_MS, 'o_que_faltou', 'O teste acabou sem assinatura', null],
    [!trialEnded && age >= WELCOME_AFTER_MS && age <= WELCOME_UNTIL_MS, 'boas_vindas', 'Acabou de criar a conta', pending],
    [!trialEnded && days >= 3 && done('caixa') && !done('venda'), 'sem_venda', 'Abriu o caixa e ainda não vendeu', step('venda')],
    [!trialEnded && days >= 2 && done('cardapio') && !done('caixa'), 'sem_caixa', 'Montou o cardápio e não abriu o caixa', step('caixa')],
    [!trialEnded && days >= 1 && !done('cardapio'), 'cardapio_parado', 'Ainda não cadastrou os produtos', step('cardapio')],
    [
      !trialEnded && days >= 3 && !done('venda') && !!s.lastActivityAt && now.getTime() - s.lastActivityAt.getTime() >= 3 * DAY,
      'sumiu', 'Não usa o sistema há 3 dias e ainda não vendeu', pending,
    ],
  ];

  for (const [applies, trigger, reason, nextStep] of candidates) {
    if (!applies || used.has(trigger)) continue;
    const ownerAlert = OWNER_ALERT_TRIGGERS.includes(trigger);
    if (!ownerAlert && !clientAllowed) continue;
    return { trigger, reason, ownerAlert, nextStep };
  }
  return null;
}
