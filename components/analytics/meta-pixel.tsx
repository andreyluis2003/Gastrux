'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { asksConsentOn } from '@/lib/analytics/consent';
import { useConsent, useMetaPixelId } from './ga-script';

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; callMethod?: (...args: unknown[]) => void; disablePushState?: boolean };
declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

/** Set by the sign-up page right before it leaves for /auth/qualification; the pixel turns it into CompleteRegistration */
export const SIGNUP_DONE_KEY = 'gx-signup-done';

export function markSignupDone(): void {
  try {
    window.sessionStorage.setItem(SIGNUP_DONE_KEY, '1');
  } catch {
    // Storage blocked: the sign-up just isn't reported to Meta
  }
}

function takeSignupDone(): boolean {
  try {
    if (window.sessionStorage.getItem(SIGNUP_DONE_KEY) !== '1') return false;
    window.sessionStorage.removeItem(SIGNUP_DONE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Meta's loader: a queueing stub now, fbevents.js in the background */
function loadFbq(): Fbq {
  if (window.fbq) return window.fbq;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue!.push(args);
  } as Fbq;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  // The app is a single-page app: page views are sent below, only for the public pages
  n.disablePushState = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  return n;
}

/**
 * Meta Pixel for the ad campaigns (2026-10-27). Like Google Analytics it runs only after the visitor accepts cookies,
 * and only on the public pages (site, plans, sign-up): never on the restaurant's working screens nor on its
 * customers' menu and delivery pages. Sends PageView and, after a sign-up, CompleteRegistration.
 */
export function MetaPixel() {
  const pixelId = useMetaPixelId();
  const consent = useConsent();
  const pathname = usePathname();
  const active = !!pixelId && consent === 'granted' && asksConsentOn(pathname);

  useEffect(() => {
    if (!active || !pixelId) return;
    const fbq = loadFbq();
    if (!(fbq as { gxInit?: boolean }).gxInit) {
      fbq('set', 'autoConfig', false, pixelId);
      fbq('init', pixelId);
      (fbq as { gxInit?: boolean }).gxInit = true;
    }
    fbq('track', 'PageView');
    if (pathname === '/auth/qualification' && takeSignupDone()) fbq('track', 'CompleteRegistration');
  }, [active, pixelId, pathname]);

  return null;
}
