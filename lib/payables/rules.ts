import { addMonths, currentMonth, monthDate, monthOf, parseAmountCents } from '@/lib/utility-bills/rules';

/** Contas a pagar (spec 2026-10-18 contas a pagar): pure rules shared by the service, the DRE and the screen */
export { addMonths, currentMonth, monthDate, monthOf, parseAmountCents };

export type PayableCategory = 'MERCHANDISE' | 'RENT' | 'UTILITIES' | 'PAYROLL' | 'TAXES' | 'SERVICES' | 'LOANS' | 'OTHER';
export const CATEGORIES: PayableCategory[] = ['MERCHANDISE', 'RENT', 'UTILITIES', 'PAYROLL', 'TAXES', 'SERVICES', 'LOANS', 'OTHER'];
export const CATEGORY_LABEL: Record<PayableCategory, string> = {
  MERCHANDISE: 'Compra de mercadoria',
  RENT: 'Aluguel e condomínio',
  UTILITIES: 'Contas de consumo',
  PAYROLL: 'Salários e encargos',
  TAXES: 'Impostos e taxas',
  SERVICES: 'Serviços',
  LOANS: 'Empréstimos e parcelas',
  OTHER: 'Outras',
};

export const PAY_METHODS = ['CASH', 'PIX', 'BOLETO', 'CARD', 'AUTO_DEBIT', 'OTHER'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const METHOD_LABEL: Record<PayMethod, string> = {
  CASH: 'Dinheiro', PIX: 'PIX', BOLETO: 'Boleto', CARD: 'Cartão', AUTO_DEBIT: 'Débito automático', OTHER: 'Outro',
};

export type DisplayState = 'OVERDUE' | 'TODAY' | 'WEEK' | 'LATER' | 'PAID' | 'CANCELED';

export class PayableError extends Error {
  constructor(message: string, public status = 400, public extra?: Record<string, unknown>) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
const BRT_OFFSET_MS = 3 * 3_600_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Brasília day ('YYYY-MM-DD') */
export const brtToday = (now = new Date()) => new Date(now.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);

export function displayState(p: { status: string; dueDate: Date }, today: string): DisplayState {
  if (p.status === 'PAID') return 'PAID';
  if (p.status === 'CANCELED') return 'CANCELED';
  const due = iso(p.dueDate);
  if (due < today) return 'OVERDUE';
  if (due === today) return 'TODAY';
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return days <= 7 ? 'WEEK' : 'LATER';
}

/** The given day of a month; a day the month does not have becomes its last day (31 in February -> 28/29) */
export function dueDateIn(ym: string, day: number): Date {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(Math.max(1, day), last)));
}

/** Equal parts; the cents that do not divide go on the last one */
export function splitInstallments(totalCents: number, n: number): number[] {
  const part = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalCents - part * (n - 1) : part));
}

/** Same day of each month from the first due date */
export function installmentDueDates(firstDue: string, n: number): Date[] {
  const ym = firstDue.slice(0, 7);
  const day = Number(firstDue.slice(8, 10));
  return Array.from({ length: n }, (_, i) => dueDateIn(addMonths(ym, i), day));
}

/** A series keeps the bills of the current month and the next two created */
export const seriesMonths = (currentYm: string) => [0, 1, 2].map((i) => addMonths(currentYm, i));

/**
 * Where a category goes in the DRE (by competence). Utility bills already enter through the Contas de consumo
 * line and merchandise through the CMV of the recipes: counting them here would count them twice.
 */
export function dreLine(c: PayableCategory): 'OPERATIONAL' | 'PAYROLL' | null {
  if (c === 'UTILITIES' || c === 'MERCHANDISE') return null;
  return c === 'PAYROLL' ? 'PAYROLL' : 'OPERATIONAL';
}

export function parseDay(v: unknown, field = 'Vencimento'): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new PayableError(`${field} inválido`);
  }
  return v;
}

export const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
