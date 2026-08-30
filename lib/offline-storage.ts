// @ts-nocheck
/**
 * FASE 11: Offline Storage - IndexedDB utilities for offline data persistence
 */

const DB_NAME = 'restaurantes-app';
const DB_VERSION = 1;

export interface StorageSchema {
  stock: StockItem;
  recipes: RecipeItem;
  'production-plans': ProductionPlanItem;
  'pending-changes': PendingChange;
  metadata: SyncMetadata;
}

export interface StockItem {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  lastUpdated: string;
}

export interface RecipeItem {
  id: string;
  name: string;
  ingredients: any[];
  lastUpdated: string;
}

export interface ProductionPlanItem {
  id: string;
  date: string;
  items: any[];
  lastUpdated: string;
}

export interface PendingChange {
  id: string;
  type: 'stock' | 'recipe' | 'plan';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
  synced: boolean;
}

export interface SyncMetadata {
  key: string;
  lastSync: string;
  version: number;
  syncStatus: 'synced' | 'syncing' | 'error';
}

let db: IDBDatabase | null = null;

export async function initializeOfflineStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      const stores = ['stock', 'recipes', 'production-plans', 'pending-changes', 'metadata'];

      stores.forEach((store) => {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: 'id' });
        }
      });
    };
  });
}

function getDB(): IDBDatabase {
  if (!db) {
    throw new Error('Offline storage not initialized');
  }
  return db;
}

export async function saveToStore<K extends keyof StorageSchema>(
  storeName: K,
  data: StorageSchema[K]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const database = getDB();
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getFromStore<K extends keyof StorageSchema>(
  storeName: K,
  key: string
): Promise<StorageSchema[K] | undefined> {
  return new Promise((resolve, reject) => {
    const database = getDB();
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getAllFromStore<K extends keyof StorageSchema>(
  storeName: K
): Promise<StorageSchema[K][]> {
  return new Promise((resolve, reject) => {
    const database = getDB();
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function addPendingChange(
  type: PendingChange['type'],
  action: PendingChange['action'],
  data: any
): Promise<string> {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const change: PendingChange = {
    id,
    type,
    action,
    data,
    timestamp: new Date().toISOString(),
    synced: false,
  };

  await saveToStore('pending-changes', change);
  return id;
}

export async function getPendingChanges(): Promise<PendingChange[]> {
  const changes = await getAllFromStore('pending-changes');
  return changes.filter((c) => !c.synced);
}

export async function markChangeAsSynced(changeId: string): Promise<void> {
  const change = await getFromStore('pending-changes', changeId);
  if (change) {
    await saveToStore('pending-changes', {
      ...change,
      synced: true,
    });
  }
}

export async function getLastSyncTime(): Promise<string | null> {
  const metadata = await getFromStore('metadata', 'sync-metadata');
  return metadata?.lastSync || null;
}

export async function updateSyncMetadata(status: SyncMetadata['syncStatus']): Promise<void> {
  const metadata: SyncMetadata = {
    key: 'sync-metadata',
    lastSync: new Date().toISOString(),
    version: 1,
    syncStatus: status,
  };

  await saveToStore('metadata', metadata);
}

export async function getStorageUsage(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return { usage: 0, quota: 0 };
}
