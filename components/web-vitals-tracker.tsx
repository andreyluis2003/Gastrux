'use client';

import { useWebVitals } from '@/hooks/use-web-vitals';

/**
 * Web Vitals Tracker Component
 * Automatically tracks and reports Core Web Vitals metrics
 * Place in root layout to enable tracking on all pages
 */
export function WebVitalsTracker() {
  useWebVitals();
  return null;
}
