// @ts-nocheck
/**
 * Web Vitals Tracking
 * Tracks Core Web Vitals metrics using native browser APIs
 */

export interface VitalMetric {
  name: string;
  value: number;
  timestamp: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  id: string;
}

export interface VitalsData {
  lcp?: VitalMetric;
  fid?: VitalMetric;
  inp?: VitalMetric;
  cls?: VitalMetric;
  fcp?: VitalMetric;
  ttfb?: VitalMetric;
  url: string;
  userAgent: string;
  timestamp: number;
}

/**
 * Get rating for a metric based on Web Vitals thresholds
 */
function getRating(
  metricName: string,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    fid: [100, 300],
    inp: [200, 500],
    cls: [0.1, 0.25],
    fcp: [1800, 3000],
    ttfb: [600, 1200],
  };

  const [good, poor] = thresholds[metricName] || [Infinity, Infinity];

  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Track Largest Contentful Paint (LCP)
 */
export function trackLCP(callback: (metric: VitalMetric) => void): void {
  if (typeof window === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1] as any;

    const value = lastEntry.startTime || lastEntry.renderTime || 0;
    const metric: VitalMetric = {
      name: 'LCP',
      value,
      timestamp: Date.now(),
      rating: getRating('lcp', value),
      id: `lcp-${Date.now()}`,
    };

    callback(metric);
  });

  try {
    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (e) {
    console.debug('LCP tracking not supported');
  }
}

/**
 * Track First Input Delay (FID) / Interaction to Next Paint (INP)
 */
export function trackInputDelay(callback: (metric: VitalMetric) => void): void {
  if (typeof window === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();

    entries.forEach((entry: any) => {
      const metric: VitalMetric = {
        name: entry.interactionId ? 'INP' : 'FID',
        value: entry.processingDuration || 0,
        timestamp: Date.now(),
        rating: getRating('fid', entry.processingDuration || 0),
        id: `fid-${Date.now()}`,
      };

      callback(metric);
    });
  });

  try {
    observer.observe({
      entryTypes: ['first-input', 'event'],
      buffered: true,
    });
  } catch (e) {
    console.debug('FID/INP tracking not supported');
  }
}

/**
 * Track Cumulative Layout Shift (CLS)
 */
export function trackCLS(callback: (metric: VitalMetric) => void): void {
  if (typeof window === 'undefined') return;

  let clsValue = 0;
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry: any) => {
      if (!entry.hadRecentInput) {
        clsValue += entry.value || 0;

        const metric: VitalMetric = {
          name: 'CLS',
          value: clsValue,
          timestamp: Date.now(),
          rating: getRating('cls', clsValue),
          id: `cls-${Date.now()}`,
        };

        callback(metric);
      }
    });
  });

  try {
    observer.observe({ entryTypes: ['layout-shift'], buffered: true });
  } catch (e) {
    console.debug('CLS tracking not supported');
  }
}

/**
 * Track First Contentful Paint (FCP)
 */
export function trackFCP(callback: (metric: VitalMetric) => void): void {
  if (typeof window === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const fcpEntry = entries.find((entry) => entry.name === 'first-contentful-paint');

    if (fcpEntry) {
      const metric: VitalMetric = {
        name: 'FCP',
        value: fcpEntry.startTime || 0,
        timestamp: Date.now(),
        rating: getRating('fcp', fcpEntry.startTime || 0),
        id: `fcp-${Date.now()}`,
      };

      callback(metric);
    }
  });

  try {
    observer.observe({ entryTypes: ['paint'], buffered: true });
  } catch (e) {
    console.debug('FCP tracking not supported');
  }
}

/**
 * Track Time to First Byte (TTFB)
 */
export function trackTTFB(callback: (metric: VitalMetric) => void): void {
  if (typeof window === 'undefined') return;

  if (performance.timing) {
    const ttfb = performance.timing.responseStart - performance.timing.fetchStart;

    const metric: VitalMetric = {
      name: 'TTFB',
      value: ttfb,
      timestamp: Date.now(),
      rating: getRating('ttfb', ttfb),
      id: `ttfb-${Date.now()}`,
    };

    callback(metric);
  }
}

/**
 * Collect all Web Vitals metrics
 */
export function collectWebVitals(): Promise<VitalsData> {
  return new Promise((resolve) => {
    const vitals: VitalsData = {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: Date.now(),
    };

    let metricsCollected = 0;
    const totalMetrics = 6;

    const checkComplete = () => {
      metricsCollected++;
      if (metricsCollected === totalMetrics) {
        resolve(vitals);
      }
    };

    trackLCP((metric) => {
      vitals.lcp = metric;
      checkComplete();
    });

    trackInputDelay((metric) => {
      if (metric.name === 'FID') vitals.fid = metric;
      else vitals.inp = metric;
      checkComplete();
    });

    trackCLS((metric) => {
      vitals.cls = metric;
      checkComplete();
    });

    trackFCP((metric) => {
      vitals.fcp = metric;
      checkComplete();
    });

    trackTTFB((metric) => {
      vitals.ttfb = metric;
      checkComplete();
    });

    checkComplete();
  });
}

/**
 * Send vitals data to analytics endpoint
 */
export async function sendVitalsToAnalytics(vitals: VitalsData): Promise<void> {
  try {
    await fetch('/api/analytics/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vitals),
      keepalive: true,
    });
  } catch (error) {
    console.debug('Failed to send web vitals:', error);
  }
}
