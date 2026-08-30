'use client';

import { useEffect } from 'react';
import { useAnalytics } from './use-analytics';

/**
 * Hook for tracking time spent on a page
 * Tracks and reports time when user leaves the page
 */
export function useTimeTracking(pageName: string) {
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    const startTime = Date.now();

    const handleBeforeUnload = () => {
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      
      if (typeof window !== 'undefined' && window.gtag) {
        trackEvent('page_time', {
          'page_name': pageName,
          'time_spent_seconds': timeSpent
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pageName, trackEvent]);
}
