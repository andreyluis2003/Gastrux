// @ts-nocheck
import { getPerformanceMonitor } from './performance-monitor';

// Intercept global fetch to measure performance
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window);

  (window as any).fetch = function (resource: RequestInfo | URL, init?: RequestInit) {
    const url = typeof resource === 'string' ? resource : (resource as URL).toString();
    const method = init?.method || 'GET';

    const startTime = performance.now();
    
    try {
      const endpoint = new URL(url, window.location.origin).pathname;

      return originalFetch(resource, init)
        .then((response: Response) => {
          const duration = performance.now() - startTime;
          getPerformanceMonitor().recordMetric(endpoint, method, duration, response.status);
          return response;
        })
        .catch((error: any) => {
          const duration = performance.now() - startTime;
          getPerformanceMonitor().recordMetric(url, method, duration, 0);
          throw error;
        });
    } catch {
      return originalFetch(resource, init);
    }
  };
}
