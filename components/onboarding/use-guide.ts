'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Channel, GuideStatus } from '@/lib/onboarding/guide';
import { GUIDE_REFRESH, fetchGuide, refreshGuide } from '@/lib/onboarding/guide-client';
import { TOUR_KEY } from '@/lib/onboarding/tour';

/** The guide of the current restaurant, read again when a step is marked anywhere on the page */
export function useGuide(initial: GuideStatus | null = null, enabled = true) {
  const [guide, setGuide] = useState<GuideStatus | null>(initial);
  const load = useCallback(async () => {
    const g = await fetchGuide();
    if (g) setGuide(g);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    if (!initial) void load();
    const onRefresh = () => void load();
    window.addEventListener(GUIDE_REFRESH, onRefresh);
    return () => window.removeEventListener(GUIDE_REFRESH, onRefresh);
  }, [enabled, initial, load]);

  const setChannels = useCallback(async (channels: Channel[]) => {
    // Shown at once; the server answer replaces it
    setGuide((g) => (g ? { ...g, channels, channelsChosen: true } : g));
    try {
      const res = await fetch('/api/onboarding/guide', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels }) });
      if (res.ok) setGuide(await res.json());
      refreshGuide();
    } catch {
      void load();
    }
  }, [load]);

  return { guide, setChannels, reload: load };
}

/** Starts the guided test order on the Vender screen (spec 2026-11-05 §3) */
export const TOUR_EVENT = 'gastrux:tour';
export function startTour() {
  try { localStorage.setItem(TOUR_KEY, JSON.stringify({ step: 0 })); } catch {}
  window.dispatchEvent(new Event(TOUR_EVENT));
}
