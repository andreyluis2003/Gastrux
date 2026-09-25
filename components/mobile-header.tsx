'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { MobileHeaderContent } from './mobile-header-content';

// This wrapper ensures MobileHeader only renders after hydration
export function MobileHeader() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Public marketing pages have their own nav already
  const isPublicMarketingPage = pathname === '/' || pathname === '/pricing' || !!pathname?.startsWith('/para/');
  if (!mounted || isPublicMarketingPage) return null;
  return <MobileHeaderContent />;
}
