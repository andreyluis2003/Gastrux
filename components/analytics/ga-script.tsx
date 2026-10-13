'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { CONSENT_EVENT, readConsent, type Consent } from '@/lib/analytics/consent';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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

export const analyticsConfigured = Boolean(GA_MEASUREMENT_ID);

/**
 * Google Analytics 4, loaded only after the visitor accepts cookies (lib/analytics/consent.ts).
 * Without NEXT_PUBLIC_GA_MEASUREMENT_ID nothing loads.
 */
export function GAScript() {
  const consent = useConsent();
  if (!GA_MEASUREMENT_ID || consent !== 'granted') return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
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
