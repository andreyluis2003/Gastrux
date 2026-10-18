'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { OnboardingProvider } from './onboarding/onboarding-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    // Every 5 minutes the session is read again, and with it the plan lock (lib/billing/plan-claim.ts)
    <NextAuthSessionProvider refetchInterval={300} refetchOnWindowFocus>
      {children}
      <OnboardingProvider />
    </NextAuthSessionProvider>
  );
}

// Export SessionProvider as an alias for backwards compatibility
export const SessionProvider = Providers;
