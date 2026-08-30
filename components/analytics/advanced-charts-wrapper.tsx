'use client';

import { AnalyticsDashboard } from './analytics-dashboard';

/**
 * Componente wrapper para AnalyticsDashboard
 * Usado pelo SmartChartLoader para lazy loading
 */
export function AdvancedCharts() {
  return <AnalyticsDashboard />;
}
