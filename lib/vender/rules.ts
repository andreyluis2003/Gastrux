/**
 * Rules of the Vender screen (spec docs/superpowers/specs/2026-10-07-tela-vender-design.md, 4.1 and
 * 4.2). Pure, so the screen and the tests share them.
 */

export interface MenuEntry {
  id: string;
  name: string;
  price: number | string;
  recipeId: string | null;
  recipe?: { id: string } | null;
  available?: boolean;
  category?: { id: string; name: string; position: number; emoji?: string | null } | null;
}

export interface MenuGroup { id: string; name: string; emoji: string | null; items: MenuEntry[] }

const OTHERS = { id: '__outros', name: 'Outros', emoji: null };

/** The menu by category, in the order the API sends it (category position, then item position) */
export function groupByCategory(items: MenuEntry[]): MenuGroup[] {
  const groups = new Map<string, MenuGroup>();
  for (const item of items) {
    // Unavailable items, and items without a recipe (the server cannot add them), are not offered
    if (item.available === false || !entryRecipeId(item)) continue;
    const c = item.category ?? null;
    const key = c ? c.id : OTHERS.id;
    if (!groups.has(key)) groups.set(key, c ? { id: c.id, name: c.name, emoji: c.emoji ?? null, items: [] } : { ...OTHERS, items: [] });
    groups.get(key)!.items.push(item);
  }
  const list = [...groups.values()];
  return [...list.filter((g) => g.id !== OTHERS.id), ...list.filter((g) => g.id === OTHERS.id)];
}

export function entryRecipeId(entry: MenuEntry): string | null {
  return entry.recipeId || entry.recipe?.id || null;
}

/** A line the kitchen does not have yet: no sentAt (each line keeps its own state), or made offline */
export function isUnsent(line: { sentAt?: string | null; pending?: boolean }): boolean {
  return !!line.pending || !line.sentAt;
}

export function unsentCount(lines: Array<{ sentAt?: string | null; pending?: boolean }>): number {
  return lines.filter((l) => isUnsent(l)).length;
}

/** "agora", "47 min", "1 h 05" */
export function openFor(openedAt: string | Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(openedAt).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export function sessionLabel(s: { table?: { number: number } | null; tableNumber?: number | null; customerName?: string | null }): string {
  const n = s.table?.number ?? s.tableNumber;
  if (n) return `Mesa ${n}`;
  return s.customerName || 'Balcão';
}

/** "aberta agora", "aberta há 47 min" */
export function openedLabel(openedAt: string | Date, now: Date): string {
  const t = openFor(openedAt, now);
  return t === 'agora' ? 'aberta agora' : `aberta há ${t}`;
}
