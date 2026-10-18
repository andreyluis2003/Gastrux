'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { bannerFor } from '@/lib/billing/plan-banner-text';
import { shellMode } from '@/lib/navigation/app-nav';
import { cn } from '@/lib/utils';

const TONE = { info: 'bg-sky-700', warn: 'bg-amber-600', danger: 'bg-red-700' } as const;

/**
 * The trial / locked bar (spec 2026-10-18 §6), placed like the offline bar (components/offline-indicator.tsx):
 * below the top bar and beside the computer menu. z-30: the offline bar (z-40) wins when both show.
 */
export function PlanBanner() {
  const { data: session } = useSession() || ({} as any);
  const mode = shellMode(usePathname() || '/');
  const user = session?.user as { planState?: string | null; trialDaysLeft?: number | null; role?: string } | undefined;
  const banner = bannerFor(user?.planState, user?.trialDaysLeft);
  if (!banner || mode === 'none') return null;

  return (
    <div
      className={cn(
        'fixed left-0 right-0 top-14 z-30 px-4 py-2 text-sm text-white shadow-md flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center',
        mode === 'sidebar' && 'md:top-0 md:left-64',
        TONE[banner.tone]
      )}
      role="status"
    >
      <span>
        {banner.text}
        {user?.planState === 'locked' && user?.role !== 'OWNER' && ' Avise o dono do restaurante.'}
      </span>
      <Link href="/pricing" className="underline font-semibold">
        Escolher plano
      </Link>
    </div>
  );
}
