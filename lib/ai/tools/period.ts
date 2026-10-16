import { brtDayStart } from '@/lib/staff/commission-rules';

export class AiToolError extends Error {}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);
const valid = (d: string) => DAY.test(d) && new Date(`${d}T00:00:00.000Z`).toISOString().slice(0, 10) === d;

/** A period the model asks for: { inicio, fim } as AAAA-MM-DD, Brasília days, end inclusive, at most 366 days */
export function parsePeriod(input: unknown) {
  const i = (input ?? {}) as { inicio?: unknown; fim?: unknown };
  if (typeof i.inicio !== 'string' || typeof i.fim !== 'string' || !valid(i.inicio) || !valid(i.fim)) {
    throw new AiToolError('Período inválido: use inicio e fim no formato AAAA-MM-DD.');
  }
  if (i.fim < i.inicio) throw new AiToolError('Período inválido: o fim vem antes do início.');
  const days = (Date.parse(i.fim) - Date.parse(i.inicio)) / 864e5 + 1;
  if (days > 366) throw new AiToolError('Período longo demais: no máximo 366 dias.');
  return { startDate: i.inicio, endDate: i.fim, from: brtDayStart(i.inicio), to: brtDayStart(nextDay(i.fim)) };
}
