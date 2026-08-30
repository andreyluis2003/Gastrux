'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { SyncProgress } from '@/lib/sync-manager';

export function SyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncProgress>({
    total: 0,
    completed: 0,
    status: 'success',
  });

  useEffect(() => {
    const handleSyncComplete = (event: MessageEvent) => {
      if (event.data.type === 'SYNC_COMPLETE') {
        setSyncStatus({
          total: 0,
          completed: 0,
          status: event.data.success ? 'success' : 'error',
        });
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage?.({
        type: 'SYNC_STATUS',
      });

      navigator.serviceWorker.addEventListener('message', handleSyncComplete);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSyncComplete);
      };
    }
  }, []);

  if (syncStatus.status === 'success' && syncStatus.total === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-slate-900 rounded-lg shadow-lg p-3 flex items-center gap-2 border border-slate-200 dark:border-slate-700 z-40">
      {syncStatus.status === 'syncing' && (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span className="text-sm font-medium">
            Syncing... {syncStatus.completed}/{syncStatus.total}
          </span>
        </>
      )}

      {syncStatus.status === 'success' && (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            Synced ✓
          </span>
        </>
      )}

      {syncStatus.status === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            Sync failed
          </span>
        </>
      )}
    </div>
  );
}
