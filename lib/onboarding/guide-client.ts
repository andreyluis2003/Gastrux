'use client';

import type { GuideMark, GuideStatus } from '@/lib/onboarding/guide';

/** Tells the guide panel and the home to read the guide again */
export const GUIDE_REFRESH = 'gastrux:guide-refresh';
export const refreshGuide = () => window.dispatchEvent(new Event(GUIDE_REFRESH));

/**
 * Marks one of the new first steps done (spec 2026-11-05 §2). Never in the way of the action itself:
 * a cashier (403) or no connection just leaves the step to do.
 */
export async function markGuideStep(mark: GuideMark): Promise<void> {
  try {
    const res = await fetch('/api/onboarding/guide', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark }) });
    if (res.ok) refreshGuide();
  } catch {
    // The step stays to do
  }
}

export async function fetchGuide(): Promise<GuideStatus | null> {
  try {
    const res = await fetch('/api/onboarding/guide', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as GuideStatus) : null;
  } catch {
    return null;
  }
}
