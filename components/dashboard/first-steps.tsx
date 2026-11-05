'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import type { GuideStatus } from '@/lib/onboarding/guide';
import { GuideSteps } from '@/components/onboarding/guide-steps';
import { useGuide } from '@/components/onboarding/use-guide';
import { GUIDE_HIDDEN_KEY, GUIDE_SHOW_EVENT } from '@/components/onboarding/guide-launcher';
import { Dismissible } from './dismissible';

/**
 * The way to sell from the home (usability walkthrough 2026-10-12): a "Vender" button for everyone and,
 * for who manages the restaurant, the first steps still to do, in the same groups as the "Comece por aqui"
 * panel (spec 2026-11-05). The card leaves once every step is done, or when hidden on this device.
 */
export function FirstSteps({ guide: initial, canSell = true }: { guide: GuideStatus | null; canSell?: boolean }) {
  const { guide, setChannels } = useGuide(initial, !!initial);
  const [launcherHidden, setLauncherHidden] = useState(false);
  useEffect(() => {
    try { setLauncherHidden(!!localStorage.getItem(GUIDE_HIDDEN_KEY)); } catch {}
  }, []);
  const showLauncher = () => {
    try { localStorage.removeItem(GUIDE_HIDDEN_KEY); } catch {}
    setLauncherHidden(false);
    window.dispatchEvent(new Event(GUIDE_SHOW_EVENT));
  };

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
      {guide && guide.done < guide.total && (
        <Dismissible storageKey="gastrux-first-steps-hidden">
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 pr-8">
            <h2 className="text-base font-semibold">Primeiros passos</h2>
            <span className="text-sm text-slate-500">{guide.done} de {guide.total} concluídos</span>
          </div>
          <GuideSteps guide={guide} onChannels={setChannels} />
          {launcherHidden && guide.active && (
            <button type="button" onClick={showLauncher} className="mt-3 text-xs text-primary hover:underline">
              Mostrar o botão “Comece por aqui” em todas as telas
            </button>
          )}
        </section>
        </Dismissible>
      )}
    </div>
  );
}
