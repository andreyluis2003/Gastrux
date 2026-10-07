/**
 * Client health for the Gastrux team (platform screens only, 2026-10-07): where each restaurant is in
 * the funnel and what deserves a call today. Pure: the numbers come from lib/admin/client-profile.ts.
 */

export type ClientStage = 'SIGNED_UP' | 'MENU_READY' | 'SELLING' | 'PAYING';

export const STAGES: Array<{ value: ClientStage; label: string; hint: string }> = [
  { value: 'SIGNED_UP', label: 'Cadastrou', hint: 'Criou a conta, ainda sem cardápio' },
  { value: 'MENU_READY', label: 'Montou o cardápio', hint: 'Tem produtos, ainda sem venda fechada' },
  { value: 'SELLING', label: 'Vendendo', hint: 'Já fechou contas no sistema' },
  { value: 'PAYING', label: 'Assinante', hint: 'Plano pago e ativo' },
];

export interface ClientSignals {
  status: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  createdAt: Date;
  /** Most recent login of anyone in the restaurant */
  lastSignInAt: Date | null;
  menuItems: number;
  closedBills: number;
  closedBills30d: number;
  mpStatus: 'ACTIVE' | 'NEEDS_RECONNECT' | null;
  openTickets: number;
}

export interface ClientAlert {
  level: 'red' | 'yellow';
  text: string;
}

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);

/** The furthest step reached: paying counts on its own, the others need the previous one */
export function clientStage(s: ClientSignals): ClientStage {
  if (s.status === 'ACTIVE' && s.subscriptionStatus === 'active') return 'PAYING';
  if (s.closedBills > 0) return 'SELLING';
  if (s.menuItems > 0) return 'MENU_READY';
  return 'SIGNED_UP';
}

/** What deserves attention, most urgent first */
export function clientAlerts(s: ClientSignals, now: Date): ClientAlert[] {
  const out: ClientAlert[] = [];
  const closed = ['CANCELLED', 'ARCHIVED'].includes(s.status);

  if (s.status === 'TRIAL' && s.trialEndsAt) {
    const left = Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / DAY);
    if (left < 0) out.push({ level: 'red', text: 'Teste vencido' });
    else if (left <= 3) out.push({ level: 'red', text: left === 0 ? 'Teste acaba hoje' : `Teste acaba em ${left} dia${left > 1 ? 's' : ''}` });
  }
  if (s.status === 'SUSPENDED') out.push({ level: 'red', text: 'Conta suspensa' });
  if (s.subscriptionStatus === 'past_due') out.push({ level: 'red', text: 'Pagamento em atraso' });
  if (s.mpStatus === 'NEEDS_RECONNECT') out.push({ level: 'red', text: 'Mercado Pago desconectado' });
  if (s.openTickets > 0) out.push({ level: 'yellow', text: `${s.openTickets} chamado${s.openTickets > 1 ? 's' : ''} aberto${s.openTickets > 1 ? 's' : ''}` });

  if (!closed) {
    const idle = s.lastSignInAt ? daysBetween(s.lastSignInAt, now) : daysBetween(s.createdAt, now);
    if (idle >= 7) out.push({ level: 'yellow', text: s.lastSignInAt ? `Sem entrar há ${idle} dias` : `Nunca voltou (${idle} dias)` });
    if (s.menuItems === 0 && daysBetween(s.createdAt, now) >= 2) out.push({ level: 'yellow', text: 'Parado no cadastro: sem cardápio' });
    else if (s.menuItems > 0 && s.closedBills === 0 && daysBetween(s.createdAt, now) >= 7) out.push({ level: 'yellow', text: 'Montou o cardápio mas não vendeu' });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
}

/** Labels of the sign-up answers (/auth/qualification) */
export const ANSWER_LABELS: Record<string, Record<string, string>> = {
  businessStage: { operating: 'Já em operação', opening_soon: 'Vai abrir em breve', just_researching: 'Só pesquisando' },
  locationCount: { '1': '1 unidade', '2_5': '2 a 5 unidades', '6_plus': '6 ou mais unidades' },
  mainPainPoint: { estoque: 'Controle de estoque', cmv: 'Custo de receita / CMV', caixa: 'Caixa e vendas', outro: 'Outro' },
  leadQuality: { qualified: 'Qualificado', curious: 'Curioso' },
};

/** wa.me link from a Brazilian phone typed any way ("(11) 98888-7777" -> 5511988887777) */
export function whatsappLink(phone: string | null) {
  const digits = (phone || '').replace(/\D/g, '');
  // DDD + number has 10 or 11 digits; with the country code, 12 or 13 (DDD 55 is Santa Maria/RS, so
  // the length decides, not a leading 55)
  if (digits.length === 10 || digits.length === 11) return `https://wa.me/55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `https://wa.me/${digits}`;
  return null;
}
