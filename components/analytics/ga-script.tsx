'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Script from 'next/script';
import { CONSENT_EVENT, readConsent, type Consent } from '@/lib/analytics/consent';

/**
 * The GA id comes from the root layout, read on the server at request time (lib/analytics/consent.ts gaIdFrom):
 * NEXT_PUBLIC_* is inlined at build and the Easypanel build has no env, so the browser bundle never had it.
 */
const GaIdContext = createContext<string | null>(null);

export function AnalyticsProvider({ gaId, children }: { gaId: string | null; children: React.ReactNode }) {
  return <GaIdContext.Provider value={gaId}>{children}</GaIdContext.Provider>;
}

export function useGaId(): string | null {
  return useContext(GaIdContext);
}

/** The visitor's cookie choice, kept in step with the banner and the footer link. */
export function useConsent(): Consent | null | undefined {
  // undefined until the browser was read (server render and first paint show nothing)
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  useEffect(() => {
    setConsent(readConsent());
    const onChange = (e: Event) => setConsent((e as CustomEvent<Consent | null>).detail ?? null);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);
  return consent;
}

/**
 * Google Analytics 4, loaded only after the visitor accepts cookies (lib/analytics/consent.ts).
 * Without a GA id nothing loads.
 */
export function GAScript() {
  const gaId = useGaId();
  const consent = useConsent();
  if (!gaId || consent !== 'granted') return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', {
            'send_page_view': true,
            'anonymize_ip': true,
            'allow_google_signals': false,
            'allow_ad_personalization_signals': false
          });
        `}
      </Script>
    </>
  );
}
