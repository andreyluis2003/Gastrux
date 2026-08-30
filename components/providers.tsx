'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { OnboardingProvider } from './onboarding/onboarding-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      {children}
      <OnboardingProvider />
    </NextAuthSessionProvider>
  );
}

// Export SessionProvider as an alias for backwards compatibility
export const SessionProvider = Providers;
