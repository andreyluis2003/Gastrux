// @ts-nocheck
/**
 * Performance Monitoring - Phase 10.3
 * Track regional latency, cache hit rates, and database pool statistics
 */

export interface PerformanceMetric {
  timestamp: Date;
  endpoint: string;
  region: string;
  responseTime: number; // milliseconds
  cacheHit: boolean;
  cacheStrategy: string;
  payloadSize: number; // bytes
  statusCode: number;
}

export interface RegionalLatency {
  region: string;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  sampleCount: number;
}

export interface CacheHitStats {
  strategy: string;
  totalRequests: number;
  cacheHits: number;
  hitRate: number; // 0-100
  avgSavedTime: number; // milliseconds
}

export interface DatabasePoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  avgConnectionTime: number; // milliseconds
  avgQueryTime: number; // milliseconds
}

/**
 * In-memory metrics collector
 * In production, use Redis or similar for distributed metrics
 */
class PerformanceMetricsCollector {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 10000; // Keep last 10k metrics

  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getRegionalLatency(region?: string): RegionalLatency[] {
    const filtered = region
      ? this.metrics.filter(m => m.region === region)
      : this.metrics;

    const byRegion = new Map<string, PerformanceMetric[]>();
    filtered.forEach(m => {
      if (!byRegion.has(m.region)) {
        byRegion.set(m.region, []);
      }
      byRegion.get(m.region)!.push(m);
    });

    const results: RegionalLatency[] = [];
    byRegion.forEach((metrics, regionName) => {
      const times = metrics.map(m => m.responseTime).sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = times[Math.floor(times.length * 0.95)];
      const p99 = times[Math.floor(times.length * 0.99)];

      results.push({
        region: regionName,
        avgLatency: Math.round(avg),
        p95Latency: p95,
        p99Latency: p99,
        minLatency: Math.min(...times),
        maxLatency: Math.max(...times),
        sampleCount: metrics.length
      });
    });

    return results.sort((a, b) => a.avgLatency - b.avgLatency);
  }

  getCacheHitStats(strategy?: string): CacheHitStats[] {
    const filtered = strategy
      ? this.metrics.filter(m => m.cacheStrategy === strategy)
      : this.metrics;

    const byStrategy = new Map<string, PerformanceMetric[]>();
    filtered.forEach(m => {
      if (!byStrategy.has(m.cacheStrategy)) {
        byStrategy.set(m.cacheStrategy, []);
      }
      byStrategy.get(m.cacheStrategy)!.push(m);
    });

    const results: CacheHitStats[] = [];
    byStrategy.forEach((metrics, strategyName) => {
      const hits = metrics.filter(m => m.cacheHit).length;
      const total = metrics.length;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;
      const savedTime = metrics
        .filter(m => m.cacheHit)
        .reduce((acc, m) => acc + m.responseTime * 0.8, 0) / (hits || 1); // Assume cache saves 80%

      results.push({
        strategy: strategyName,
        totalRequests: total,
        cacheHits: hits,
        hitRate,
        avgSavedTime: Math.round(savedTime)
      });
    });

    return results.sort((a, b) => b.hitRate - a.hitRate);
  }

  getMetricsSummary() {
    if (this.metrics.length === 0) {
      return null;
    }

    const times = this.metrics.map(m => m.responseTime);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const cacheHits = this.metrics.filter(m => m.cacheHit).length;
    const totalPayload = this.metrics.reduce((acc, m) => acc + m.payloadSize, 0);

    return {
      metricsCount: this.metrics.length,
      avgResponseTime: Math.round(avgTime),
      minResponseTime: Math.min(...times),
      maxResponseTime: Math.max(...times),
      cacheHitRate: (cacheHits / this.metrics.length) * 100,
      totalPayloadSize: totalPayload,
      avgPayloadSize: Math.round(totalPayload / this.metrics.length),
      errorRate: (this.metrics.filter(m => m.statusCode >= 400).length / this.metrics.length) * 100
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

// Global singleton instance
let collector: PerformanceMetricsCollector | null = null;

export function getMetricsCollector(): PerformanceMetricsCollector {
  if (!collector) {
    collector = new PerformanceMetricsCollector();
  }
  return collector;
}

/**
 * Hook into Next.js instrumentation for metrics
 */
export async function recordApiMetric(
  endpoint: string,
  region: string,
  responseTime: number,
  cacheHit: boolean,
  cacheStrategy: string,
  payloadSize: number,
  statusCode: number
): Promise<void> {
  const collector = getMetricsCollector();
  collector.recordMetric({
    timestamp: new Date(),
    endpoint,
    region,
    responseTime,
    cacheHit,
    cacheStrategy,
    payloadSize,
    statusCode
  });
}
