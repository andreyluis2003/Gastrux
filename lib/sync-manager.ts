// @ts-nocheck
/**
 * FASE 11: Sync Manager - Orchestrates offline data synchronization
 */

import { getPendingChanges, markChangeAsSynced, updateSyncMetadata } from './offline-storage';

export interface SyncProgress {
  total: number;
  completed: number;
  status: 'pending' | 'syncing' | 'success' | 'error' | 'synced';
  currentItem?: string;
  error?: string;
}

class SyncManager {
  private isSyncing = false;
  private syncAbortController: AbortController | null = null;

  async syncPendingChanges(onProgress?: (progress: SyncProgress) => void): Promise<boolean> {
    if (this.isSyncing) {
      console.log('[SyncManager] Already syncing, skipping...');
      return false;
    }

    this.isSyncing = true;
    this.syncAbortController = new AbortController();

    try {
      const changes = await getPendingChanges();
      const total = changes.length;

      console.log(`[SyncManager] Syncing ${total} pending changes...`);

      if (total === 0) {
        onProgress?.({
          total: 0,
          completed: 0,
          status: 'success',
        });
        await updateSyncMetadata('synced');
        return true;
      }

      onProgress?.({
        total,
        completed: 0,
        status: 'syncing',
      });

      let completed = 0;
      let hasErrors = false;

      for (const change of changes) {
        if (this.syncAbortController.signal.aborted) {
          break;
        }

        try {
          onProgress?.({
            total,
            completed,
            status: 'syncing',
            currentItem: `${change.type}/${change.action}`,
          });

          await this.syncChange(change, 3, 30000);
          await markChangeAsSynced(change.id);
          completed++;
        } catch (error) {
          console.error(`[SyncManager] Failed to sync change ${change.id}:`, error);
          hasErrors = true;
          onProgress?.({
            total,
            completed,
            status: 'error',
            error: String(error),
          });
        }
      }

      if (hasErrors) {
        await updateSyncMetadata('error');
        return false;
      }

      await updateSyncMetadata('synced');
      onProgress?.({
        total,
        completed,
        status: 'success',
      });

      console.log(`[SyncManager] Successfully synced ${completed}/${total} changes`);
      return true;
    } finally {
      this.isSyncing = false;
      this.syncAbortController = null;
    }
  }

  private async syncChange(change: any, retries: number, timeout: number): Promise<Response> {
    const endpoint = this.getEndpointForChange(change);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(endpoint, change, timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        console.log(`[SyncManager] Attempt ${attempt + 1}/${retries} failed for ${change.id}`);

        if (attempt < retries - 1) {
          await this.sleep(100 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Unknown sync error');
  }

  private fetchWithTimeout(endpoint: string, change: any, timeout: number): Promise<Response> {
    return Promise.race([
      fetch(endpoint, {
        method: this.getMethodForAction(change.action),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change.data),
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout')), timeout)
      ),
    ]);
  }

  private getEndpointForChange(change: any): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    switch (change.type) {
      case 'stock':
        return `${baseUrl}/api/stock/${change.data.id || ''}`;
      case 'recipe':
        return `${baseUrl}/api/recipes/${change.data.id || ''}`;
      case 'plan':
        return `${baseUrl}/api/production-plans/${change.data.id || ''}`;
      default:
        throw new Error(`Unknown change type: ${change.type}`);
    }
  }

  private getMethodForAction(action: string): string {
    switch (action) {
      case 'create':
        return 'POST';
      case 'update':
        return 'PUT';
      case 'delete':
        return 'DELETE';
      default:
        return 'POST';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cancelSync(): void {
    if (this.syncAbortController) {
      this.syncAbortController.abort();
    }
  }

  isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncManager = new SyncManager();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[SyncManager] Network online, triggering sync...');
    syncManager.syncPendingChanges().catch((error) => {
      console.error('[SyncManager] Auto-sync failed:', error);
    });
  });
}
