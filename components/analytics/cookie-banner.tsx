'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { asksConsentOn, writeConsent } from '@/lib/analytics/consent';
import { analyticsConfigured, useConsent } from './ga-script';

/** Asks once, on the public pages, before Google Analytics runs (Política de Privacidade, seção 10). */
export function CookieBanner() {
  const pathname = usePathname();
  const consent = useConsent();
  if (!analyticsConfigured || consent !== null || !asksConsentOn(pathname)) return null;

  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-50 border-t bg-white px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-700">
          Usamos cookies do Google Analytics para entender como o site é usado. Os cookies de login são necessários e
          não dependem desta escolha.{' '}
          <Link href="/privacidade" className="underline">Política de Privacidade</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => writeConsent('denied')}>Recusar</Button>
          <Button size="sm" onClick={() => writeConsent('granted')}>Aceitar</Button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that forgets the choice so the banner asks again. */
export function CookiePreferencesLink({ className }: { className?: string }) {
  if (!analyticsConfigured) return null;
  return (
    <button type="button" className={className} onClick={() => writeConsent(null)}>
      Preferências de cookies
    </button>
  );
}
