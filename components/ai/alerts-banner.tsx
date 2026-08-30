'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, X, ChevronRight, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnomalyAlert {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export function AlertsBanner() {
  const { data: session } = useSession() || {};
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;

    const fetchAlerts = async () => {
      try {
        const res = await fetch('/api/ai-insights/anomaly-check');
        const data = await res.json();
        if (data.anomalies) {
          setAlerts(data.anomalies);
        }
      } catch (err) {
        console.error('[alerts-banner] Failed to fetch:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    // Poll every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session?.user]);

  const handleDismiss = async (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    // Optionally dismiss on server
    try {
      await fetch(`/api/ai-insights/${id}/dismiss`, { method: 'POST' });
    } catch { /* silent */ }
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (loading || !session?.user || visibleAlerts.length === 0) return null;

  const getSeverityColor = (tags: string[]) => {
    if (tags.includes('critical')) return 'border-red-500/50 bg-red-50 dark:bg-red-950/20';
    if (tags.includes('warning')) return 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20';
    return 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/20';
  };

  const getSeverityIcon = (tags: string[]) => {
    if (tags.includes('critical')) return 'text-red-600 dark:text-red-400';
    if (tags.includes('warning')) return 'text-amber-600 dark:text-amber-400';
    return 'text-blue-600 dark:text-blue-400';
  };

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Bell className="w-4 h-4" />
        <span>Alertas Inteligentes ({visibleAlerts.length})</span>
      </div>
      {visibleAlerts.slice(0, 5).map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'border rounded-lg px-4 py-3 transition-all',
            getSeverityColor(alert.tags),
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertTriangle className={cn('w-4 h-4 mt-0.5 shrink-0', getSeverityIcon(alert.tags))} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{alert.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.summary}</p>
                {expanded === alert.id && alert.content && (
                  <p className="text-xs text-foreground/80 mt-2 whitespace-pre-wrap">{alert.content}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="p-1 hover:bg-foreground/10 rounded transition-colors"
                onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                title={expanded === alert.id ? 'Recolher' : 'Expandir'}
              >
                <ChevronRight className={cn('w-4 h-4 transition-transform', expanded === alert.id && 'rotate-90')} />
              </button>
              <button
                className="p-1 hover:bg-foreground/10 rounded transition-colors"
                onClick={() => handleDismiss(alert.id)}
                title="Dispensar alerta"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
