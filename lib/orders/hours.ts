/**
 * Abrir e fechar a loja pelo horário (spec 2026-11-08 loja-pelo-horario): pure rules over Restaurant.businessHours
 * ({ seg: { open: '11:00', close: '23:00', closed: false }, ..., auto: true }). Day and time are the restaurant's.
 */
export const DAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
const DAY_NAME: Record<DayKey, string> = { dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado' };

export interface DayHours { open: string; close: string; closed: boolean }
export interface BusinessHours { days: Partial<Record<DayKey, DayHours>>; auto: boolean }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The stored JSON, keeping only known days with valid times */
export function parseHours(raw: unknown): BusinessHours {
  const out: BusinessHours = { days: {}, auto: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, any>;
  out.auto = r.auto === true;
  for (const k of DAY_KEYS) {
    const d = r[k];
    if (!d || typeof d !== 'object') continue;
    const closed = d.closed === true;
    if (!closed && !(HHMM.test(d.open) && HHMM.test(d.close))) continue;
    out.days[k] = { open: HHMM.test(d.open) ? d.open : '00:00', close: HHMM.test(d.close) ? d.close : '00:00', closed };
  }
  return out;
}

/** What is saved: the parsed days plus the auto flag (anything else is dropped) */
export const sanitizeHours = (raw: unknown) => {
  const h = parseHours(raw);
  return { ...h.days, auto: h.auto };
};

/** Weekday (0 = Sunday) and minute of the day in a time zone */
export function localClock(timeZone: string, now: Date): { day: number; minute: number } {
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/Sao_Paulo'; }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** The open window of a day as [start, end) minutes from that day's midnight; end past 1440 runs into the next day */
function window(d: DayHours | undefined): [number, number] | null {
  if (!d || d.closed) return null;
  const open = minutes(d.open);
  let close = minutes(d.close);
  if (close === open) return null;
  if (close < open) close += 1440; // closes after midnight ("18:00 às 02:00", "11:00 às 00:00")
  return [open, close];
}

/** Open now by the hours? Today's window, or yesterday's that runs past midnight */
export function openByHours(h: BusinessHours, day: number, minute: number): boolean {
  const today = window(h.days[DAY_KEYS[day]]);
  if (today && minute >= today[0] && minute < today[1]) return true;
  const yesterday = window(h.days[DAY_KEYS[(day + 6) % 7]]);
  return !!yesterday && yesterday[1] > 1440 && minute < yesterday[1] - 1440;
}

/** "hoje às 18:00", "amanhã às 11:00", "sexta às 11:00"; null when no day opens */
export function nextOpening(h: BusinessHours, day: number, minute: number): string | null {
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7;
    const w = window(h.days[DAY_KEYS[d]]);
    if (!w) continue;
    if (i === 0 && w[0] <= minute) continue;
    const at = h.days[DAY_KEYS[d]]!.open;
    return i === 0 ? `hoje às ${at}` : i === 1 ? `amanhã às ${at}` : `${DAY_NAME[DAY_KEYS[d]]} às ${at}`;
  }
  return null;
}

/** Closed by the hours right now (only when the owner turned the automatic mode on) */
export function hoursState(raw: unknown, timeZone: string, now = new Date()): { closedByHours: boolean; opens: string | null } {
  const h = parseHours(raw);
  if (!h.auto) return { closedByHours: false, opens: null };
  const { day, minute } = localClock(timeZone, now);
  if (openByHours(h, day, minute)) return { closedByHours: false, opens: null };
  return { closedByHours: true, opens: nextOpening(h, day, minute) };
}
