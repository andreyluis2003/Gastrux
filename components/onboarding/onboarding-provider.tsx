'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const OnboardingDialog = dynamic(
  () => import('./onboarding-dialog').then((mod) => ({ default: mod.OnboardingDialog })),
  { ssr: false, loading: () => null }
);

// Public pages where onboarding should never appear
const PUBLIC_PATHS = [
  '/', '/pricing', '/auth', '/casos-de-sucesso', '/para/',
  '/calculadora', '/ajuda', '/tutorial', '/survey',
  '/pedido-direto', '/delivery', '/termos', '/privacidade',
  '/partnerships', '/beta-testers',
];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p));
}

export function OnboardingProvider() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!session || !session.user) {
      setIsLoading(false);
      return;
    }

    // Don't show on public pages
    if (isPublicPage(pathname)) {
      setIsLoading(false);
      return;
    }

    // Only check once per session to avoid re-showing on every navigation
    if (checkedRef.current) {
      setIsLoading(false);
      return;
    }

    // If dismissed in this browser session, don't re-show
    const dismissed = sessionStorage.getItem('onboarding_dismissed');
    if (dismissed === 'true') {
      setIsLoading(false);
      checkedRef.current = true;
      return;
    }

    checkOnboardingStatus();
  }, [session, pathname]);

  const checkOnboardingStatus = async () => {
    try {
      checkedRef.current = true;
      const response = await fetch('/api/onboarding/status');
      if (response.ok) {
        const data = await response.json();
        if (!data.isCompleted && !data.isSkipped) {
          if (!data.defaultCategoriesCreated) {
            const initResponse = await fetch('/api/onboarding/start', {
              method: 'POST',
            });
            if (initResponse.ok) {
              setShowOnboarding(true);
            }
          } else {
            setShowOnboarding(true);
          }
        }
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = (open: boolean) => {
    setShowOnboarding(open);
    if (!open) {
      sessionStorage.setItem('onboarding_dismissed', 'true');
    }
  };

  if (isLoading || !session) {
    return null;
  }

  return (
    <OnboardingDialog
      open={showOnboarding}
      onOpenChange={handleDismiss}
      onCompleted={() => {
        setShowOnboarding(false);
        sessionStorage.setItem('onboarding_dismissed', 'true');
      }}
    />
  );
}
