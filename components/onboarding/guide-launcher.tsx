'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Rocket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOUR_KEY } from '@/lib/onboarding/tour';
import { GuideSteps } from './guide-steps';
import { TOUR_EVENT, useGuide } from './use-guide';

export const GUIDE_HIDDEN_KEY = 'gastrux-guide-hidden';
export const GUIDE_SHOW_EVENT = 'gastrux:guide-show';

const readFlag = (key: string) => { try { return !!localStorage.getItem(key); } catch { return false; } };

/**
 * "Comece por aqui" on every screen (spec 2026-11-05 §1): a button in the bottom left corner (the AI
 * assistant is on the right) that opens the first steps. Only for who sets the restaurant up, while the
 * guide is active; it can be hidden on this device and comes back from the home.
 */
export function GuideLauncher({ withSidebar }: { withSidebar: boolean }) {
  const pathname = usePathname() || '/';
  const { guide, setChannels } = useGuide();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [touring, setTouring] = useState(false);

  useEffect(() => {
    const sync = () => { setHidden(readFlag(GUIDE_HIDDEN_KEY)); setTouring(readFlag(TOUR_KEY)); };
    sync();
    window.addEventListener(GUIDE_SHOW_EVENT, sync);
    window.addEventListener(TOUR_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GUIDE_SHOW_EVENT, sync);
      window.removeEventListener(TOUR_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  // The home shows the same list in its card
  if (!guide?.active || hidden || touring || pathname === '/dashboard') return null;
  // Platform-team screens are not the restaurant's setup, and the button covered "Responder" there (2026-11-10)
  if (/^\/admin\/(agente|platform)(\/|$)/.test(pathname)) return null;
  // On a phone the comanda has a fixed bar at the bottom: the button would sit on it
  const onComanda = /^\/vender\/[^/]+$/.test(pathname);

  const hide = () => {
    try { localStorage.setItem(GUIDE_HIDDEN_KEY, '1'); } catch {}
    setHidden(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'fixed bottom-4 left-4 z-[58] items-center gap-2 rounded-full bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-brand-ink/90',
          withSidebar && 'md:left-[17rem]',
          onComanda ? 'hidden lg:inline-flex' : 'inline-flex'
        )}
      >
        <Rocket className="h-4 w-4" /> Comece por aqui · {guide.done} de {guide.total}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Comece por aqui"
          className={cn(
            'fixed bottom-16 left-4 z-[58] flex max-h-[75vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl',
            withSidebar && 'md:left-[17rem]'
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Comece por aqui</h2>
              <p className="text-xs text-slate-500">{guide.done} de {guide.total} concluídos</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3">
            <GuideSteps guide={guide} onChannels={setChannels} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t px-4 py-2 text-right">
            <button type="button" onClick={hide} className="text-xs text-slate-500 hover:underline">
              Esconder o guia (volta pelo Início)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
