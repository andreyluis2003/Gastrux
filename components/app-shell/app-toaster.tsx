'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { toastPosition } from '@/lib/navigation/app-nav';

/** The app's toasts, at the top on full-screen operation (lib/navigation/app-nav.ts toastPosition) */
export function AppToaster() {
  return <Toaster position={toastPosition(usePathname())} />;
}
