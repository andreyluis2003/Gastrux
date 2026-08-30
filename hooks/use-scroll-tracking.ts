'use client';

import { useEffect, useState } from 'react';
import { useAnalytics } from './use-analytics';

/**
 * Hook for tracking scroll depth on landing pages
 * Tracks when users scroll to 25%, 50%, 75%, and 100% of page
 */
export function useScrollTracking() {
  const { trackScrollDepth } = useAnalytics();
  const [trackedPercentages, setTrackedPercentages] = useState<Set<number>>(new Set());

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      
      const scrollPercentage = Math.round(
        (scrollTop / (documentHeight - windowHeight)) * 100
      );

      const milestones = [25, 50, 75, 100];
      for (const milestone of milestones) {
        if (scrollPercentage >= milestone && !trackedPercentages.has(milestone)) {
          setTrackedPercentages(prev => new Set([...prev, milestone]));
          trackScrollDepth(milestone);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [trackedPercentages, trackScrollDepth]);

  return { trackedPercentages };
}
