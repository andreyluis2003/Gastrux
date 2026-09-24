import { memoryStore, type OutboxEntry, type OutboxStore } from './outbox';

/**
 * The outbox kept in IndexedDB, so changes made offline survive a page reload or a closed tab.
 * Falls back to memory when IndexedDB is unavailable (private mode on some browsers): the changes
 * then only survive while the page stays open, which the offline banner does not hide.
 */
const DB_NAME = 'gastrux-offline';
const STORE = 'outbox';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function indexedDbStore(): OutboxStore & { persistent: boolean } {
  if (typeof indexedDB === 'undefined') return { ...memoryStore(), persistent: false };
  const dbPromise = open();
  return {
    persistent: true,
    async all() {
      return run(await dbPromise, 'readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>);
    },
    async put(entry) {
      await run(await dbPromise, 'readwrite', (s) => s.put(entry));
    },
    async remove(id) {
      await run(await dbPromise, 'readwrite', (s) => s.delete(id));
    },
    async clear() {
      await run(await dbPromise, 'readwrite', (s) => s.clear());
    },
  };
}
