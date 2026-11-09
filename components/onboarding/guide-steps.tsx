'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Circle, Clock, PlayCircle, Sparkles, Wand2 } from 'lucide-react';
import type { Channel, GuideStatus, GuideStep } from '@/lib/onboarding/guide';
import { TutorialModal } from '@/components/tutorials/tutorial-modal';
import { tutorialForFirstStep, type Tutorial } from '@/lib/tutorials/catalog';
import { cn } from '@/lib/utils';
import { startTour } from './use-guide';

/** Steps the AI can do from the chat (spec 2026-10-17 ia-implantacao §4.6) */
const AI_ASK: Partial<Record<GuideStep['key'], string>> = {
  cardapio: 'Quero importar meu cardápio por foto',
  mesas: 'Crie minhas mesas',
  equipe: 'Quero cadastrar minha equipe',
};
const askAi = (text: string) => window.dispatchEvent(new CustomEvent('gastrux:ask', { detail: { text } }));

const CHANNEL_LABEL: Record<Channel, string> = { balcao: 'Balcão', mesas: 'Mesas', delivery: 'Delivery' };

/**
 * The first steps in groups, each with its minutes (spec 2026-11-05 §2): the same list on the home and in
 * the "Comece por aqui" panel.
 */
export function GuideSteps({ guide, onChannels, onNavigate }: { guide: GuideStatus; onChannels: (c: Channel[]) => void; onNavigate?: () => void }) {
  const router = useRouter();
  const [video, setVideo] = useState<Tutorial | null>(null);
  const toggle = (c: Channel) => {
    const next = guide.channels.includes(c) ? guide.channels.filter((x) => x !== c) : [...guide.channels, c];
    onChannels(next);
  };
  const beginTour = () => {
    startTour();
    onNavigate?.();
    router.push('/vender');
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-700">Como você vende?</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Como você vende">
          {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => {
            const on = guide.channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                {CHANNEL_LABEL[c]}
              </button>
            );
          })}
        </div>
      </div>

      {guide.groups.map((g) => (
        <div key={g.id}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</h3>
          <ul className="divide-y">
            {g.steps.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                {/* The label keeps a minimum width: in the narrow panel the time and buttons drop to a second
                    line instead of squeezing the label until its words spill under them. */}
                {s.key === 'teste' && !s.done ? (
                  <button type="button" onClick={guide.hasProducts ? beginTour : undefined} disabled={!guide.hasProducts} className="flex min-w-[12rem] flex-1 items-center gap-3 text-left text-sm disabled:cursor-not-allowed">
                    <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-label="A fazer" />
                    <span className="font-medium text-slate-800">{s.label}</span>
                  </button>
                ) : (
                  <Link href={s.href} onClick={onNavigate} className="flex min-w-[12rem] flex-1 items-center gap-3 text-sm hover:bg-slate-50">
                    {s.done
                      ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Concluído" />
                      : <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-label="A fazer" />}
                    <span className={s.done ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}>
                      {s.label}{s.optional && <span className="font-normal text-slate-400"> (opcional)</span>}
                    </span>
                  </Link>
                )}
                {!s.done && (
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" /> {s.minutes} min
                    </span>
                    {s.key === 'teste' && guide.hasProducts && (
                      <button type="button" onClick={beginTour} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                        <Wand2 className="h-3.5 w-3.5" /> Começar
                      </button>
                    )}
                    {AI_ASK[s.key] && (
                      <button type="button" onClick={() => askAi(AI_ASK[s.key]!)} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-slate-50">
                        <Sparkles className="h-3.5 w-3.5" /> Fazer com a IA
                      </button>
                    )}
                    {tutorialForFirstStep(s.key) && (
                      <button type="button" onClick={() => setVideo(tutorialForFirstStep(s.key))} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-slate-50">
                        <PlayCircle className="h-3.5 w-3.5" /> Ver vídeo
                      </button>
                    )}
                  </div>
                )}
                {s.key === 'teste' && !s.done && !guide.hasProducts && (
                  <Link href="/admin/cardapio" onClick={onNavigate} className="w-full pl-8 text-xs text-amber-700 underline">
                    Cadastre um produto antes
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {video && <TutorialModal tutorial={video} onClose={() => setVideo(null)} />}
    </div>
  );
}
