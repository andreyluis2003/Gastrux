'use client';

import { useEffect, useState } from 'react';
import { getPerformanceMonitor, PerformanceStats } from '@/lib/performance-monitor';
import { GlassCard } from './ui/glass-card';
import { FadeIn, ScaleIn } from './ui/animate';
import { Activity, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PerformanceDashboard() {
  const [stats, setStats] = useState<Map<string, PerformanceStats>>(new Map());
  const [health, setHealth] = useState({ healthy: true, avgResponseTime: 0, errorRate: 0 });

  useEffect(() => {
    const monitor = getPerformanceMonitor();

    const unsubscribe = monitor.subscribe((newStats) => {
      setStats(newStats);
      setHealth(monitor.getHealthStatus());
    });

    return unsubscribe;
  }, []);

  const statusColor = health.healthy ? 'text-green-600' : 'text-red-600';
  const statusBg = health.healthy ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';

  return (
    <div className="hidden lg:block fixed bottom-4 left-4 w-80 max-h-96 overflow-hidden">
      <FadeIn>
        <GlassCard className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className={cn('h-5 w-5', statusColor)} />
              <h3 className="font-semibold text-sm">Performance</h3>
            </div>
            <div className={cn('w-2 h-2 rounded-full', health.healthy ? 'bg-green-600' : 'bg-red-600')} />
          </div>

          {/* Stats */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Tempo médio:</span>
              <span className="font-medium">{health.avgResponseTime.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Taxa de erro:</span>
              <span className={cn('font-medium', health.errorRate > 5 ? 'text-red-600' : 'text-green-600')}>
                {health.errorRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Requ.:</span>
              <span className="font-medium">{Array.from(stats.values()).reduce((sum, s) => sum + s.totalRequests, 0)}</span>
            </div>
          </div>

          {/* Top Endpoints */}
          {Array.from(stats.entries())
            .sort((a, b) => b[1].avgResponseTime - a[1].avgResponseTime)
            .slice(0, 3)
            .map(([key, stat]) => (
              <ScaleIn key={key} delay={0.1}>
                <div className={cn('p-2 rounded text-xs', stat.errorRate > 5 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-100 dark:bg-slate-800')}>
                  <p className="font-medium truncate">{stat.endpoint}</p>
                  <p className="text-slate-600 dark:text-slate-400">{stat.avgResponseTime}ms • {stat.totalRequests}req</p>
                </div>
              </ScaleIn>
            ))}
        </GlassCard>
      </FadeIn>
    </div>
  );
}
