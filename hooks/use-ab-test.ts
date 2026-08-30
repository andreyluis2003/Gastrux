'use client';

import { useEffect, useState } from 'react';
import { useAnalytics } from './use-analytics';
import { ABTestConfig, getVariant, trackABTestVariant } from '@/lib/ab-testing';

/**
 * Hook for managing A/B tests in React components
 */
export function useABTest(config: ABTestConfig) {
  const { trackEvent } = useAnalytics();
  const [variant, setVariant] = useState<'control' | 'variant-a' | 'variant-b'>('control');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Get variant after mount to avoid hydration issues
    const selectedVariant = getVariant(config.testId, config.weights);
    setVariant(selectedVariant);
    
    // Track variant assignment
    trackABTestVariant(config.testId, selectedVariant);
    trackEvent('ab_test_assigned', {
      'test_id': config.testId,
      'variant': selectedVariant,
      'event_category': 'experiment'
    });

    setIsLoaded(true);
  }, [config.testId, config.weights, trackEvent]);

  const content = config.variants[variant] || config.variants.control;

  return {
    variant,
    content,
    isLoaded,
    isControl: variant === 'control',
    isVariantA: variant === 'variant-a',
    isVariantB: variant === 'variant-b',
    trackConversion: () => {
      trackEvent('ab_test_conversion', {
        'test_id': config.testId,
        'variant': variant,
        'event_category': 'conversion'
      });
    }
  };
}
