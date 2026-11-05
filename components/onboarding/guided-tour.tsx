'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markGuideStep } from '@/lib/onboarding/guide-client';
import {
  KITCHEN_OPEN, TEST_ORDER_CANCEL_REASON, TOUR, TOUR_KEY, afterNavigation, nextStep, onStepScreen, parseTourState, screenHref, type TourState,
} from '@/lib/onboarding/tour';
import { TOUR_EVENT } from './use-guide';

const read = (): TourState | null => { try { return parseTourState(localStorage.getItem(TOUR_KEY)); } catch { return null; } };
const write = (s: TourState | null) => {
  try { if (s) localStorage.setItem(TOUR_KEY, JSON.stringify(s)); else localStorage.removeItem(TOUR_KEY); } catch {}
  window.dispatchEvent(new Event(TOUR_EVENT));
};

/** The first element matching the selector that is on screen (the comanda has the buttons twice: panel and phone bar) */
function visible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

/**
 * The guided test order over the real screens (spec 2026-11-05 §3): a blinking frame around the button to
 * tap and a short card. Nothing covers the page; "Sair do tour" always ends it.
 */
export function GuidedTour() {
  const pathname = usePathname() || '/';
  const [state, setState] = useState<TourState | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const go = useCallback((s: TourState | null) => { setState(s); write(s); }, []);

  // Started from the guide (any tab of this browser)
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(TOUR_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(TOUR_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  // Reaching a screen ends the steps that wait for it
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const after = afterNavigation(s, pathname);
    if (after !== s) go(after);
  }, [pathname, state?.step, go]);

  const step = state ? TOUR[state.step] : null;
  const here = !!(state && step && onStepScreen(step, pathname, state));

  // Follow the target on the page; skip the register step when it is open already or there is none
  useEffect(() => {
    if (!state || !step || !here) { setRect(null); return; }
    const started = Date.now();
    const tick = () => {
      if (step.skipWhen && visible(step.skipWhen)) { go(nextStep(state)); return; }
      if (step.advance.on === 'appears' && visible(step.advance.selector)) { go(nextStep(state)); return; }
      const el = step.target ? visible(step.target) : null;
      if (!el && step.skipWhenMissing && Date.now() - started > 2500) { go(nextStep(state)); return; }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((old) => (old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height ? old : { top: r.top, left: r.left, width: r.width, height: r.height }));
      } else {
        setRect(null);
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [state, step, here, go]);

  // A tap on the target ends the "tap" steps (capture: the button's own handler still runs)
  useEffect(() => {
    if (!state || !step || !here || step.advance.on !== 'click' || !step.target) return;
    const target = step.target;
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(target)) setTimeout(() => go(nextStep(state)), 50);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [state, step, here, go]);

  if (!state || !step) return null;

  const exit = () => go(null);

  async function finish(cancel: boolean) {
    const s = stateRef.current;
    setBusy(true);
    try {
      if (cancel && s?.sessionId) {
        // The kitchen orders of the test come first: an open one blocks the comanda cancel (409)
        const list = await fetch(`/api/kds/orders?status=${KITCHEN_OPEN.join(',')}`, { cache: 'no-store' });
        const orders: { id: string; orderSessionId?: string | null }[] = list.ok ? await list.json().then((b) => (Array.isArray(b) ? b : b.orders ?? [])) : [];
        for (const o of orders.filter((x) => x.orderSessionId === s.sessionId)) {
          await fetch(`/api/kds/orders/${o.id}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: TEST_ORDER_CANCEL_REASON }),
          });
        }
        const res = await fetch(`/api/comanda/sessions/${s.sessionId}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: TEST_ORDER_CANCEL_REASON }),
        });
        if (!res.ok) {
          toast.error((await res.json().catch(() => ({}))).error || 'Não foi possível cancelar o pedido de teste');
          return;
        }
        toast.success('Pedido de teste cancelado: ele não conta no faturamento');
      }
      await markGuideStep('testOrder');
      go(null);
    } catch {
      toast.error('Sem conexão: tente de novo');
    } finally {
      setBusy(false);
    }
  }

  const count = `Pedido de teste · ${state.step + 1} de ${TOUR.length}`;
  const away = !here;

  // The card goes below the target, or above it when the target is in the lower half (the phone bar)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const width = Math.min(340, vw - 24);
  let cardStyle: React.CSSProperties;
  if (rect && !away) {
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 12));
    cardStyle = rect.top + rect.height / 2 > vh / 2
      ? { left, bottom: Math.max(12, vh - rect.top + 12), width }
      : { left, top: Math.min(rect.top + rect.height + 12, vh - 180), width };
  } else {
    cardStyle = { left: Math.max(12, vw / 2 - width / 2), bottom: 88, width };
  }

  return (
    <>
      {rect && !away && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] rounded-xl ring-4 ring-amber-400 ring-offset-2 animate-pulse"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div role="dialog" aria-label="Pedido de teste guiado" className="fixed z-[70] rounded-xl border bg-white p-4 shadow-2xl" style={cardStyle}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-amber-700">{count}</span>
          <button type="button" onClick={exit} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Sair do tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        {away ? (
          <>
            <p className="text-sm text-slate-800">O pedido de teste continua em outra tela.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" asChild><Link href={screenHref(step.screen, state.sessionId)}>Ir para a tela</Link></Button>
              <Button size="sm" variant="ghost" onClick={exit}>Sair do tour</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-800">{step.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {step.goTo && (
                <Button size="sm" asChild><Link href={screenHref(step.goTo.screen, state.sessionId)}>{step.goTo.label}</Link></Button>
              )}
              {step.id === 'fim' ? (
                <>
                  <Button size="sm" disabled={busy} onClick={() => finish(true)}>{step.advance.on === 'button' ? step.advance.label : 'Concluir'}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => finish(false)}>Manter a comanda</Button>
                </>
              ) : (
                step.advance.on === 'button' && <Button size="sm" onClick={() => go(nextStep(state))}>{step.advance.label}</Button>
              )}
              {step.id !== 'fim' && <Button size="sm" variant="ghost" onClick={exit}>Sair do tour</Button>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
