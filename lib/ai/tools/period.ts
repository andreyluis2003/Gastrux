import { brtDayStart } from '@/lib/staff/commission-rules';
import { isValidYmd } from '@/lib/dates';

export class AiToolError extends Error {}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);

/** A period the model asks for: { inicio, fim } as AAAA-MM-DD, Brasília days, end inclusive, at most 366 days */
export function parsePeriod(input: unknown) {
  const i = (input ?? {}) as { inicio?: unknown; fim?: unknown };
  if (!isValidYmd(i.inicio) || !isValidYmd(i.fim)) {
    throw new AiToolError('Período inválido: use inicio e fim no formato AAAA-MM-DD.');
  }
  if (i.fim < i.inicio) throw new AiToolError('Período inválido: o fim vem antes do início.');
  const days = (Date.parse(i.fim) - Date.parse(i.inicio)) / 864e5 + 1;
  if (days > 366) throw new AiToolError('Período longo demais: no máximo 366 dias.');
  return { startDate: i.inicio, endDate: i.fim, from: brtDayStart(i.inicio), to: brtDayStart(nextDay(i.fim)) };
}
