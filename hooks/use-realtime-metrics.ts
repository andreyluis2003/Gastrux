'use client';

import { useEffect, useState } from 'react';
import { RealtimeMetrics, getAnalyticsManager } from '@/lib/realtime-analytics';

const defaultMetrics: RealtimeMetrics = {
  totalStockValue: 0,
  criticalItems: 0,
  lowItems: 0,
  totalMovements: 0,
  averageCost: 0,
  forecastAccuracy: 0,
  lastUpdated: new Date(),
};

export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState<RealtimeMetrics>(defaultMetrics);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const manager = getAnalyticsManager();
    manager.start();

    // Subscribe to updates
    const unsubscribe = manager.subscribe((newMetrics) => {
      setMetrics(newMetrics);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { metrics, isLoading };
}
