// @ts-nocheck
/**
 * React 18 Streaming Utilities
 * Provides helpers for progressive data loading and streaming
 */

import { Prisma } from '@prisma/client';

/**
 * Data loading strategy for streaming pages
 * Defines what data to fetch for each priority level
 */
export interface StreamingConfig {
  /**
   * Critical data loaded immediately (< 100ms)
   */
  critical: () => Promise<any>;

  /**
   * High priority data loaded after 100-200ms
   */
  high?: () => Promise<any>;

  /**
   * Medium priority data loaded after 500ms
   */
  medium?: () => Promise<any>;

  /**
   * Low priority data loaded after 1000ms+
   */
  low?: () => Promise<any>;
}

/**
 * Execute streaming data fetches in parallel
 * Returns results as they complete
 */
export async function loadStreamingData(config: StreamingConfig) {
  const results: Record<string, any> = {};

  // Always load critical data first
  results.critical = await config.critical();

  // Load remaining priorities in parallel (not awaited immediately)
  const promises = [];

  if (config.high) {
    promises.push(
      config.high().then((data) => {
        results.high = data;
      })
    );
  }

  if (config.medium) {
    promises.push(
      config.medium().then((data) => {
        results.medium = data;
      })
    );
  }

  if (config.low) {
    promises.push(
      config.low().then((data) => {
        results.low = data;
      })
    );
  }

  // Start promise execution but dont wait for completion
  Promise.all(promises).catch(() => {
    // Silently handle errors to not block streaming
  });

  return results;
}

/**
 * Estimate data size to determine streaming strategy
 */
export function estimateDataSize(data: unknown): number {
  const json = JSON.stringify(data);
  return json.length;
}

/**
 * Batch similar queries to reduce N+1 problems
 * Usage: await batchLoad(ids, (id) => db.find(id))
 */
export async function batchLoad<T, R>(
  ids: T[],
  loadFn: (ids: T[]) => Promise<R[]>
): Promise<R[]> {
  if (ids.length === 0) return [];
  return loadFn(ids);
}
