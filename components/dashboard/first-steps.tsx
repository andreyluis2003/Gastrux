import Link from 'next/link';
import { CheckCircle2, Circle, ShoppingBag } from 'lucide-react';
import type { FirstStep } from '@/lib/onboarding/first-steps';

/**
 * The way to sell from the home (usability walkthrough 2026-10-12): a "Vender" button for everyone and,
 * for who manages the restaurant, the first steps still to do. The card leaves once every step is done.
 */
export function FirstSteps({ steps }: { steps: FirstStep[] | null }) {
  const doneCount = steps?.filter((s) => s.done).length ?? 0;
  return (
    <div className="space-y-4">
      <Link
        href="/vender"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto sm:inline-flex"
      >
        <ShoppingBag className="h-5 w-5" /> Vender
      </Link>
      {steps && doneCount < steps.length && (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Primeiros passos</h2>
            <span className="text-sm text-slate-500">{doneCount} de {steps.length} concluídos</span>
          </div>
          <ul className="divide-y">
            {steps.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                  {s.done
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Concluído" />
                    : <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-label="A fazer" />}
                  <span className={s.done ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
