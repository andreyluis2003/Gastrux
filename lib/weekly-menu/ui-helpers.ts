// Pure helpers for the weekly menu screens (spec 2026-11-10 cardapio-da-semana).

/** Browser-local "YYYY-MM-DDTHH:mm" (datetime-local value) to ISO; empty/invalid means no deadline. */
export function deadlineToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** ISO instant to the browser-local value a datetime-local input expects. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** selected: menuItemId -> "Porções" text ('' = no limit). Invalid or non-positive limits mean no limit. */
export function buildItems(selected: Record<string, string>): { menuItemId: string; portionLimit: number | null }[] {
  return Object.entries(selected).map(([menuItemId, raw]) => {
    const n = Number.parseInt(raw, 10)
    return { menuItemId, portionLimit: Number.isFinite(n) && n > 0 ? n : null }
  })
}

/** "Feijoada: 18 de 20" or "Feijoada: 18" when the product has no limit. */
export function summaryLine(name: string, quantity: number, limit: number | null | undefined): string {
  return limit ? `${name}: ${quantity} de ${limit}` : `${name}: ${quantity}`
}

/** Customer confirmation line: "Encomenda para sábado, 15/11". */
export function confirmationText(dayLabelText: string): string {
  return `Encomenda para ${dayLabelText}`
}
