/**
 * FASE 38: Performance Monitoring Utilities
 * Tracks Core Web Vitals and API response times
 */

import { useEffect, useCallback } from 'react';

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
  
  // Custom metrics
  apiResponseTime?: number;
  cacheHit?: boolean;
  queryExecutionTime?: number;
}

export interface PerformanceStats {
  endpoint: string;
  avgResponseTime: number;
  errorRate: number;
  totalRequests: number;
  lastUpdated: Date;
}

/**
 * Performance Monitor singleton for tracking API stats
 */
class PerformanceMonitor {
  private stats: Map<string, PerformanceStats> = new Map();
  private listeners: Set<(stats: Map<string, PerformanceStats>) => void> = new Set();

  recordRequest(endpoint: string, duration: number, error: boolean = false) {
    const existing = this.stats.get(endpoint) || {
      endpoint,
      avgResponseTime: 0,
      errorRate: 0,
      totalRequests: 0,
      lastUpdated: new Date(),
    };

    const newTotal = existing.totalRequests + 1;
    const newAvg = ((existing.avgResponseTime * existing.totalRequests) + duration) / newTotal;
    const errorsSoFar = existing.errorRate * existing.totalRequests;
    const newErrorRate = (errorsSoFar + (error ? 1 : 0)) / newTotal;

    this.stats.set(endpoint, {
      endpoint,
      avgResponseTime: Math.round(newAvg),
      errorRate: Math.round(newErrorRate * 100) / 100,
      totalRequests: newTotal,
      lastUpdated: new Date(),
    });

    this.notify();
  }

  subscribe(callback: (stats: Map<string, PerformanceStats>) => void): () => void {
    this.listeners.add(callback);
    callback(this.stats);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.stats));
  }

  getHealthStatus() {
    let totalRequests = 0;
    let totalErrors = 0;
    let totalTime = 0;

    this.stats.forEach(stat => {
      totalRequests += stat.totalRequests;
      totalErrors += stat.errorRate * stat.totalRequests;
      totalTime += stat.avgResponseTime * stat.totalRequests;
    });

    const avgResponseTime = totalRequests > 0 ? totalTime / totalRequests : 0;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    return {
      healthy: avgResponseTime < 1000 && errorRate < 0.05,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  getStats(): Map<string, PerformanceStats> {
    return this.stats;
  }
}

const globalMonitor = new PerformanceMonitor();

export function getPerformanceMonitor(): PerformanceMonitor {
  return globalMonitor;
}

/**
 * Log performance metrics to analytics
 */
export function logPerformanceMetrics(metrics: PerformanceMetrics) {
  if (typeof window === 'undefined') return;
  
  // Send to analytics in production
  if (process.env.NODE_ENV === 'production') {
    try {
      // Use sendBeacon for reliable delivery
      const data = JSON.stringify({
        ...metrics,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      });
      
      navigator.sendBeacon?.('/api/analytics/performance', new Blob([data], { type: 'application/json' }));
    } catch (e) {
      // Silently fail - don't impact user experience
    }
  }
  
  // Always log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Performance]', metrics);
  }
}

/**
 * Hook to track API request performance
 */
export function useApiTiming(endpoint: string) {
  const start = useCallback(() => {
    return performance.now();
  }, []);
  
  const end = useCallback((startTime: number, success: boolean = true) => {
    const duration = Math.round(performance.now() - startTime);
    logPerformanceMetrics({
      apiResponseTime: duration,
    });
    
    // Also record in the monitor
    globalMonitor.recordRequest(endpoint, duration, !success);
    
    // Warn if API is slow
    if (duration > 1000) {
      console.warn(`[Slow API] ${endpoint} took ${duration}ms`);
    }
    
    return duration;
  }, [endpoint]);
  
  return { start, end };
}

/**
 * Hook to measure component render time
 */
export function useRenderTiming(componentName: string) {
  useEffect(() => {
    const start = performance.now();
    
    return () => {
      const duration = performance.now() - start;
      if (duration > 100) {
        console.warn(`[Slow Render] ${componentName} took ${Math.round(duration)}ms to mount`);
      }
    };
  }, [componentName]);
}

/**
 * Track cache hit rates
 */
let cacheStats = {
  hits: 0,
  misses: 0,
  total: 0,
};

export function trackCacheHit(hit: boolean) {
  cacheStats.total++;
  if (hit) {
    cacheStats.hits++;
  } else {
    cacheStats.misses++;
  }
}

export function getCacheStats() {
  return {
    ...cacheStats,
    hitRate: cacheStats.total > 0 ? (cacheStats.hits / cacheStats.total) * 100 : 0,
  };
}

export function resetCacheStats() {
  cacheStats = { hits: 0, misses: 0, total: 0 };
}

/**
 * Lazy load component with performance tracking
 */
export function lazyLoadWithTracking<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  componentName: string
) {
  return async () => {
    const start = performance.now();
    const module = await importFn();
    const duration = performance.now() - start;
    
    logPerformanceMetrics({
      [componentName]: duration,
    });
    
    return module;
  };
}
