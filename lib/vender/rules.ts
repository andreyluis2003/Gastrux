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
    if (item.available === false) continue;
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

export interface LineLike {
  id: string;
  recipeId: string;
  price: number | string;
  quantity: number;
  addedAt?: string;
  specialInstructions?: string | null;
  modifiers?: unknown[];
  /** Made offline, still in this device's outbox */
  pending?: boolean;
}

/** Same rule as lib/kds/send-session.ts: new = added after the last send (or never sent) */
export function isUnsent(line: { addedAt?: string; pending?: boolean }, sentToKitchenAt: string | null | undefined): boolean {
  if (line.pending) return true;
  if (!sentToKitchenAt || !line.addedAt) return true;
  return new Date(line.addedAt) > new Date(sentToKitchenAt);
}

export function unsentCount(lines: Array<{ addedAt?: string; pending?: boolean }>, sentToKitchenAt: string | null | undefined): number {
  return lines.filter((l) => isUnsent(l, sentToKitchenAt)).length;
}

/**
 * The line a one-tap add goes into: a new (not sent), plain (no modifiers, no note) line of the same
 * recipe and price, already on the server. None: the tap creates a new line.
 */
export function mergeTarget(lines: LineLike[], sentToKitchenAt: string | null | undefined, entry: MenuEntry): LineLike | null {
  const recipeId = entryRecipeId(entry);
  const candidates = lines.filter(
    (l) =>
      !l.pending &&
      l.recipeId === recipeId &&
      Number(l.price) === Number(entry.price) &&
      !(l.modifiers?.length) &&
      !l.specialInstructions &&
      isUnsent(l, sentToKitchenAt)
  );
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (new Date(b.addedAt ?? 0) > new Date(a.addedAt ?? 0) ? b : a));
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
