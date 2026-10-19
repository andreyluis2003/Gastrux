import Link from 'next/link';
import type { Tile, TileTone } from '@/lib/dashboard/today-tiles';

/** "Painel do dia" (2026-10-18 UX research, proposal 1): each tile opens its screen */
const TONE: Record<TileTone, string> = {
  ok: 'border-emerald-200 bg-emerald-50/60',
  warn: 'border-amber-300 bg-amber-50',
  alert: 'border-red-300 bg-red-50',
  neutral: 'border-slate-200 bg-white dark:bg-slate-900',
};

export function TodayPanel({ tiles }: { tiles: Tile[] }) {
  if (!tiles.length) return null;
  return (
    <section aria-label="Hoje" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-xl border p-4 transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${TONE[t.tone]}`}
        >
          <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{t.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>
        </Link>
      ))}
    </section>
  );
}
