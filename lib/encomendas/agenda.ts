/**
 * The encomendas agenda (spec docs/superpowers/specs/2026-10-26-encomendas-design.md): late, today,
 * tomorrow and the next days, by the Brasília calendar day. Pure, safe to import from the browser.
 */

const TZ = 'America/Sao_Paulo';

export type AgendaKey = 'atrasadas' | 'hoje' | 'amanha' | 'proximos';
export const AGENDA_LABELS: Record<AgendaKey, string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  proximos: 'Próximos dias',
};

/** "2026-10-26": the calendar day in Brasília */
function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function nextDayKey(d: Date): string {
  const [y, m, day] = dayKey(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1, 12)).toISOString().slice(0, 10);
}

export function agenda<T extends { pickupAt: string | null }>(items: T[], now: Date): Array<{ key: AgendaKey; label: string; items: T[] }> {
  const today = dayKey(now);
  const tomorrow = nextDayKey(now);
  const groups: Record<AgendaKey, T[]> = { atrasadas: [], hoje: [], amanha: [], proximos: [] };
  const sorted = [...items].sort((a, b) => new Date(a.pickupAt ?? 0).getTime() - new Date(b.pickupAt ?? 0).getTime());
  for (const item of sorted) {
    const when = new Date(item.pickupAt ?? 0);
    const day = dayKey(when);
    if (when.getTime() < now.getTime()) groups.atrasadas.push(item);
    else if (day === today) groups.hoje.push(item);
    else if (day === tomorrow) groups.amanha.push(item);
    else groups.proximos.push(item);
  }
  return (Object.keys(groups) as AgendaKey[]).filter((k) => groups[k].length).map((k) => ({ key: k, label: AGENDA_LABELS[k], items: groups[k] }));
}

/** "hoje às 15:00", "amanhã às 15:00", "qua., 28/10 às 12:00" */
export function pickupLabel(pickupAt: string, now: Date): string {
  const when = new Date(pickupAt);
  const time = when.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const day = dayKey(when);
  if (day === dayKey(now)) return `hoje às ${time}`;
  if (day === nextDayKey(now)) return `amanhã às ${time}`;
  const date = when.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${date} às ${time}`;
}
