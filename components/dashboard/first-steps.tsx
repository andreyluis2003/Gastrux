'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Circle, PlayCircle, ShoppingBag, Sparkles } from 'lucide-react';
import type { FirstStep } from '@/lib/onboarding/first-steps';
import { TutorialModal } from '@/components/tutorials/tutorial-modal';
import { tutorialForFirstStep, type Tutorial } from '@/lib/tutorials/catalog';
import { Dismissible } from './dismissible';

/**
 * The way to sell from the home (usability walkthrough 2026-10-12): a "Vender" button for everyone and,
 * for who manages the restaurant, the first steps still to do. The card leaves once every step is done,
 * or when hidden on this device.
 */
/** Steps the AI can do from the chat (spec 2026-10-17 ia-implantacao §4.6) */
const AI_ASK: Partial<Record<FirstStep['key'], string>> = {
  cardapio: 'Quero importar meu cardápio por foto',
  mesas: 'Crie minhas mesas',
  equipe: 'Quero cadastrar minha equipe',
};
const askAi = (text: string) => window.dispatchEvent(new CustomEvent('gastrux:ask', { detail: { text } }));

/** canSell: the "Vender" button only for who sells (owner, manager, cashier; prod audit 2026-10-17) */
export function FirstSteps({ steps, canSell = true }: { steps: FirstStep[] | null; canSell?: boolean }) {
  // The optional step (team) never keeps the card from being done
  const required = steps?.filter((s) => !s.optional) ?? [];
  const doneCount = required.filter((s) => s.done).length;
  const [video, setVideo] = useState<Tutorial | null>(null);
  return (
    <div className="space-y-4">
      {canSell && (
      <Link
        href="/vender"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto sm:inline-flex"
      >
        <ShoppingBag className="h-5 w-5" /> Vender
      </Link>
      )}
      {steps && doneCount < required.length && (
        <Dismissible storageKey="gastrux-first-steps-hidden">
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-2 pr-8">
            <h2 className="text-base font-semibold">Primeiros passos</h2>
            <span className="text-sm text-slate-500">{doneCount} de {required.length} concluídos</span>
          </div>
          <ul className="divide-y">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <Link href={s.href} className="flex flex-1 items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                  {s.done
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Concluído" />
                    : <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-label="A fazer" />}
                  <span className={s.done ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}>
                    {s.label}{s.optional && <span className="font-normal text-slate-400"> (opcional)</span>}
                  </span>
                </Link>
                {!s.done && AI_ASK[s.key] && (
                  <button
                    type="button"
                    onClick={() => askAi(AI_ASK[s.key]!)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-slate-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Fazer com a IA
                  </button>
                )}
                {!s.done && tutorialForFirstStep(s.key) && (
                  <button
                    type="button"
                    onClick={() => setVideo(tutorialForFirstStep(s.key))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-slate-50"
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> Ver vídeo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        </Dismissible>
      )}
      {video && <TutorialModal tutorial={video} onClose={() => setVideo(null)} />}
    </div>
  );
}
