// Pure rules for the weekly menu (spec 2026-11-10 cardapio-da-semana).
// Service dates are YYYY-MM-DD strings in the restaurant's timezone.

const DEFAULT_TZ = 'America/Sao_Paulo'

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return timeZone
  } catch {
    return DEFAULT_TZ
  }
}

/** Today's date (YYYY-MM-DD) in the given timezone; invalid zone falls back to Sao Paulo. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Earliest menu not before today whose deadline (if any) has not passed. */
export function openMenuOf<T extends { serviceDate: string; orderDeadline: Date | null }>(
  menus: T[],
  today: string,
  now: Date,
): T | null {
  let best: T | null = null
  for (const m of menus) {
    if (m.serviceDate < today) continue
    if (m.orderDeadline && m.orderDeadline.getTime() <= now.getTime()) continue
    if (!best || m.serviceDate < best.serviceDate) best = m
  }
  return best
}

/** True once the service date has arrived (orders are released to the kitchen). */
export function isDue(serviceDate: string, today: string): boolean {
  return serviceDate <= today
}

/** Portions left; null means no limit; never negative. */
export function remainingPortions(limit: number | null, ordered: number): number | null {
  if (limit === null) return null
  return Math.max(0, limit - ordered)
}

export function productionSummary(
  items: { menuItemId: string; name: string; quantity: number; specialInstructions?: string | null }[],
): { menuItemId: string; name: string; quantity: number; notes: { text: string; quantity: number }[] }[] {
  const byItem = new Map<string, { menuItemId: string; name: string; quantity: number; notes: Map<string, number> }>()
  for (const it of items) {
    let row = byItem.get(it.menuItemId)
    if (!row) {
      row = { menuItemId: it.menuItemId, name: it.name, quantity: 0, notes: new Map() }
      byItem.set(it.menuItemId, row)
    }
    row.quantity += it.quantity
    const note = it.specialInstructions?.trim()
    if (note) row.notes.set(note, (row.notes.get(note) ?? 0) + it.quantity)
  }
  return [...byItem.values()]
    .map((r) => ({
      menuItemId: r.menuItemId,
      name: r.name,
      quantity: r.quantity,
      notes: [...r.notes].map(([text, quantity]) => ({ text, quantity })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** e.g. 'sábado, 15/11' (lowercase pt-BR weekday + dd/mm). */
export function dayLabel(serviceDate: string): string {
  const [y, m, d] = serviceDate.split('-').map(Number)
  // Noon UTC keeps the calendar day stable; the date is already a local calendar date.
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(/-feira$/, '')
    .toLowerCase()
  return `${weekday}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

export function bannerText(serviceDate: string, deadline: Date | null, timeZone: string): string {
  const base = `Pedidos para ${dayLabel(serviceDate)}`
  if (!deadline) return base
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: safeTimeZone(timeZone),
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(deadline)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = get('weekday').replace(/-feira$/, '').toLowerCase()
  const hour = String(Number(get('hour')))
  const minute = get('minute')
  const time = minute === '00' ? `${hour}h` : `${hour}h${minute}`
  return `${base} · encomende até ${weekday} às ${time}`
}

export function closedText(serviceDate: string): string {
  return `Pedidos encerrados para ${dayLabel(serviceDate)}`
}

/** The refusal when an order asks for more than is left */
export function portionsLeftText(name: string, left: number): string {
  if (left <= 0) return `${name} esgotou`
  return left === 1 ? `${name}: só resta 1 porção` : `${name}: só restam ${left} porções`
}

/** Failed release attempts after which the admin flags a pre-order (it is still retried) */
export const STUCK_AFTER_ATTEMPTS = 3;

/** A PLACED pre-order that failed to release 3+ times on/after its day: the admin asks to place it by the Balcão. */
export function isReleaseStuck(status: string, releaseAttempts: number, serviceDate: string, today: string): boolean {
  return status === 'PLACED' && releaseAttempts >= STUCK_AFTER_ATTEMPTS && isDue(serviceDate, today);
}
