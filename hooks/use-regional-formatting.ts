/**
 * useRegionalFormatting Hook - Phase 10.2
 * React hook for regional data formatting
 */

'use client';

import { useEffect, useState } from 'react';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatDateTime,
  formatPercentage,
  applyRegionalTax,
  removeRegionalTax,
  getRegionalConfig,
  getRegionName,
  type LatamRegion
} from '@/lib/regional-formatters';

/**
 * Hook to access regional formatting utilities
 */
export function useRegionalFormatting(defaultRegion: LatamRegion | string = 'BR') {
  const [region, setRegion] = useState<LatamRegion | string>(defaultRegion);

  // Get region from geolocation header or localStorage
  useEffect(() => {
    const stored = localStorage.getItem('preferred-region');
    if (stored) {
      setRegion(stored);
    } else if (typeof window !== 'undefined') {
      // Get region from response headers (set by middleware)
      const headerRegion = document.querySelector('html')?.getAttribute('data-region');
      if (headerRegion) {
        setRegion(headerRegion);
      }
    }
  }, []);

  return {
    region,
    setRegion: (newRegion: LatamRegion | string) => {
      setRegion(newRegion);
      localStorage.setItem('preferred-region', newRegion);
    },
    
    // Formatting utilities
    formatCurrency: (value: number | null | undefined) =>
      formatCurrency(value, region),
    
    formatNumber: (value: number | null | undefined, decimals?: number) =>
      formatNumber(value, region, decimals),
    
    formatDate: (date: Date | null | undefined) =>
      formatDate(date, region),
    
    formatDateTime: (date: Date | null | undefined) =>
      formatDateTime(date, region),
    
    formatPercentage: (value: number | null | undefined, decimals?: number) =>
      formatPercentage(value, region, decimals),
    
    applyTax: (value: number) =>
      applyRegionalTax(value, region),
    
    removeTax: (value: number) =>
      removeRegionalTax(value, region),
    
    // Config utilities
    config: getRegionalConfig(region),
    regionName: getRegionName(region)
  };
}
