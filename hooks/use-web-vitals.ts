'use client';

import { useEffect } from 'react';
import {
  trackLCP,
  trackInputDelay,
  trackCLS,
  trackFCP,
  trackTTFB,
  sendVitalsToAnalytics,
  VitalMetric,
  VitalsData,
} from '@/lib/web-vitals-tracker';

/**
 * Hook to automatically track and report Web Vitals metrics
 * Collects metrics and sends them to analytics endpoint
 */
export function useWebVitals() {
  useEffect(() => {
    const vitals: VitalsData = {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: Date.now(),
    };

    // Track each metric
    trackLCP((metric: VitalMetric) => {
      vitals.lcp = metric;
      if (process.env.NODE_ENV === 'development') {
        console.log('LCP:', metric.value.toFixed(0) + 'ms', `(${metric.rating})`);
      }
    });

    trackInputDelay((metric: VitalMetric) => {
      if (metric.name === 'FID') vitals.fid = metric;
      else vitals.inp = metric;

      if (process.env.NODE_ENV === 'development') {
        console.log(`${metric.name}:`, metric.value.toFixed(0) + 'ms', `(${metric.rating})`);
      }
    });

    trackCLS((metric: VitalMetric) => {
      vitals.cls = metric;
      if (process.env.NODE_ENV === 'development') {
        console.log('CLS:', metric.value.toFixed(3), `(${metric.rating})`);
      }
    });

    trackFCP((metric: VitalMetric) => {
      vitals.fcp = metric;
      if (process.env.NODE_ENV === 'development') {
        console.log('FCP:', metric.value.toFixed(0) + 'ms', `(${metric.rating})`);
      }
    });

    trackTTFB((metric: VitalMetric) => {
      vitals.ttfb = metric;
      if (process.env.NODE_ENV === 'development') {
        console.log('TTFB:', metric.value.toFixed(0) + 'ms', `(${metric.rating})`);
      }
    });

    // Send vitals after page load
    const sendVitals = () => {
      if (vitals.lcp || vitals.fcp) {
        sendVitalsToAnalytics(vitals).catch((error) => {
          console.debug('Failed to send vitals:', error);
        });
      }
    };

    window.addEventListener('load', sendVitals);
    window.addEventListener('beforeunload', sendVitals);

    return () => {
      window.removeEventListener('load', sendVitals);
      window.removeEventListener('beforeunload', sendVitals);
    };
  }, []);
}
