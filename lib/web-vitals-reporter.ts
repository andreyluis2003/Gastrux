// @ts-nocheck
'use client';

import type { Metric } from 'web-vitals';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

/**
 * Reporter de Web Vitals para monitoramento
 * Envia métricas para endpoint de analytics
 */
export function reportWebVitals() {
  if (typeof window === 'undefined') return;

  onCLS((metric: Metric) => reportMetric('CLS', metric));
  onFCP((metric: Metric) => reportMetric('FCP', metric));
  onINP((metric: Metric) => reportMetric('INP', metric));
  onLCP((metric: Metric) => reportMetric('LCP', metric));
  onTTFB((metric: Metric) => reportMetric('TTFB', metric));
}

function reportMetric(name: string, metric: Metric) {
  // Enviar para API de analytics
  if (navigator.sendBeacon) {
    const body = JSON.stringify({
      metric: name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      timestamp: new Date().toISOString(),
    });
    navigator.sendBeacon('/api/analytics/web-vitals', body);
  } else {
    // Fallback para fetch
    fetch('/api/analytics/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metric: name,
        value: metric.value,
        rating: metric.rating,
        id: metric.id,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {});
  }
}
