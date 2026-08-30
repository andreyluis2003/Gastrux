// @ts-nocheck
// Real-time analytics utilities

export interface RealtimeMetrics {
  totalStockValue: number;
  criticalItems: number;
  lowItems: number;
  totalMovements: number;
  averageCost: number;
  forecastAccuracy: number;
  lastUpdated: Date;
}

export class RealtimeAnalyticsManager {
  private updateInterval: NodeJS.Timeout | null = null;
  private listeners: ((metrics: RealtimeMetrics) => void)[] = [];
  private cachedMetrics: RealtimeMetrics | null = null;

  constructor(private updateFrequencyMs: number = 30000) {}

  /**
   * Subscribe to metrics updates
   */
  subscribe(callback: (metrics: RealtimeMetrics) => void): () => void {
    this.listeners.push(callback);
    
    // Send cached metrics immediately if available
    if (this.cachedMetrics) {
      callback(this.cachedMetrics);
    }

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
      if (this.listeners.length === 0) {
        this.stop();
      }
    };
  }

  /**
   * Start polling for metrics updates
   */
  start(): void {
    if (this.updateInterval) return;

    this.fetchMetrics();
    this.updateInterval = setInterval(() => this.fetchMetrics(), this.updateFrequencyMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Fetch metrics from API
   */
  private async fetchMetrics(): Promise<void> {
    try {
      const response = await fetch('/api/analytics/metrics');
      if (!response.ok) throw new Error('Failed to fetch metrics');

      const data = await response.json();
      this.cachedMetrics = {
        ...data,
        lastUpdated: new Date(),
      };

      this.notifyListeners();
    } catch (error) {
      console.error('Error fetching realtime metrics:', error);
    }
  }

  /**
   * Notify all listeners of updated metrics
   */
  private notifyListeners(): void {
    if (!this.cachedMetrics) return;
    this.listeners.forEach((listener) => listener(this.cachedMetrics!));
  }

  /**
   * Force refresh metrics
   */
  refresh(): void {
    this.fetchMetrics();
  }
}

// Singleton instance
let analyticsManager: RealtimeAnalyticsManager | null = null;

export function getAnalyticsManager(): RealtimeAnalyticsManager {
  if (!analyticsManager) {
    analyticsManager = new RealtimeAnalyticsManager(30000); // Update every 30 seconds
  }
  return analyticsManager;
}
