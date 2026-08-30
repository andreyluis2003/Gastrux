'use client';

import { useState, useEffect } from 'react';
import { MobileHeaderContent } from './mobile-header-content';

// This wrapper ensures MobileHeader only renders after hydration
export function MobileHeader() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MobileHeaderContent />;
}
