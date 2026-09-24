/**
 * The device outbox for offline mode (owner decision 2026-09-24, option (a); market practice for
 * cloud POS): the comanda and the cash register keep working on the device while the internet is
 * down. A change that cannot reach the server is kept here and sent again, in order, when the
 * connection returns.
 *
 * - every change has ONE Idempotency-Key, used on every attempt: when the first attempt reached the
 *   server and only the answer was lost, the replay gets the stored answer (lib/api/idempotency.ts)
 *   instead of adding the item twice;
 * - network error, 408, 409 (still running), 429 or 5xx: kept and retried later, in order;
 * - any other 4xx will never succeed by repeating it: marked "failed", shown to the operator, who
 *   can discard it (it is never retried silently at every reconnect);
 * - only changes marked `queueable` are kept: anything else (PIX, delivery, reports, registrations)
 *   is refused offline with an honest message instead of pretending to work.
 *
 * Pure logic: the storage (IndexedDB in the browser, memory in tests) and fetch are injected.
 */

export interface OutboxEntry {
  /** Also the Idempotency-Key. */
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  /** What the operator reads ("Item adicionado à mesa 4"). */
  label: string;
  /** Groups entries for a screen (e.g. the comanda id), so it can show what is still pending. */
  scope?: string;
  /** What the screen shows for the change while it waits (e.g. the item name and price). */
  display?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface OutboxStore {
  all(): Promise<OutboxEntry[]>;
  put(entry: OutboxEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clear?(): Promise<void>;
}

export interface SendRequest {
  method: OutboxEntry['method'];
  url: string;
  body?: unknown;
  label: string;
  scope?: string;
  display?: Record<string, unknown>;
  /** Only these may wait in the outbox. */
  queueable: boolean;
}

export type SendResult =
  | { queued: false; response: Response }
  | { queued: true; entry: OutboxEntry };

export class OfflineUnavailableError extends Error {
  constructor(label: string) {
    super(`Sem internet: "${label}" precisa de conexão e não foi feito. Tente de novo quando a internet voltar.`);
  }
}

export interface FlushResult {
  sent: number;
  failed: number;
  pending: number;
}

export type OutboxListener = (entries: OutboxEntry[]) => void;

const RETRYABLE = (status: number) => status === 408 || status === 409 || status === 429 || status >= 500;

export function createOutbox(deps: {
  store: OutboxStore;
  fetch?: typeof fetch;
  isOnline?: () => boolean;
  newKey?: () => string;
  now?: () => number;
  /** Called after a queued change reached the server (e.g. to refresh the screen). */
  onSent?: (entry: OutboxEntry, response: Response) => void;
}) {
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const isOnline = deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const newKey = deps.newKey ?? (() => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`));
  const now = deps.now ?? (() => Date.now());
  const listeners = new Set<OutboxListener>();
  let flushing: Promise<FlushResult> | null = null;

  const entries = async () => (await deps.store.all()).sort((a, b) => a.createdAt - b.createdAt);
  const notify = async () => {
    const list = await entries();
    listeners.forEach((listener) => listener(list));
  };

  const attempt = (entry: Pick<OutboxEntry, 'id' | 'method' | 'url' | 'body'>) =>
    doFetch(entry.url, {
      method: entry.method,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': entry.id },
      body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
    });

  async function enqueue(request: SendRequest, id: string, lastError?: string): Promise<OutboxEntry> {
    const entry: OutboxEntry = {
      id,
      method: request.method,
      url: request.url,
      body: request.body,
      label: request.label,
      scope: request.scope,
      display: request.display,
      createdAt: now(),
      attempts: lastError ? 1 : 0,
      status: 'pending',
      lastError,
    };
    await deps.store.put(entry);
    await notify();
    return entry;
  }

  /** Sends the waiting changes in order. Two calls at once share one run. */
  function flush(): Promise<FlushResult> {
    if (flushing) return flushing;
    flushing = (async () => {
      let sent = 0;
      let failed = 0;
      for (const entry of await entries()) {
        if (entry.status !== 'pending') continue;
        if (!isOnline()) break;
        let response: Response;
        try {
          response = await attempt(entry);
        } catch (error) {
          await deps.store.put({ ...entry, attempts: entry.attempts + 1, lastError: String((error as Error)?.message ?? error) });
          break; // still offline: keep the order, try again later
        }
        if (response.ok) {
          await deps.store.remove(entry.id);
          sent++;
          deps.onSent?.(entry, response);
        } else if (RETRYABLE(response.status)) {
          await deps.store.put({ ...entry, attempts: entry.attempts + 1, lastError: `HTTP ${response.status}` });
          break;
        } else {
          const detail = await response
            .json()
            .then((b: any) => b?.error as string | undefined)
            .catch(() => undefined);
          await deps.store.put({ ...entry, attempts: entry.attempts + 1, status: 'failed', lastError: detail || `HTTP ${response.status}` });
          failed++;
        }
      }
      const pending = (await entries()).filter((e) => e.status === 'pending').length;
      await notify();
      return { sent, failed, pending };
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    /**
     * Sends now when possible. A queueable change that cannot reach the server is kept (and
     * reported as queued); anything else throws OfflineUnavailableError while offline.
     * While older changes are still waiting, a new queueable one waits behind them (order matters:
     * an item must reach the comanda before "send to kitchen").
     */
    async send(request: SendRequest): Promise<SendResult> {
      const id = newKey();
      const waiting = (await entries()).some((e) => e.status === 'pending');
      if (!isOnline() || (request.queueable && waiting)) {
        if (!request.queueable) throw new OfflineUnavailableError(request.label);
        const entry = await enqueue(request, id);
        if (isOnline()) void flush().catch(() => null); // online, only waiting behind older changes
        return { queued: true, entry };
      }
      try {
        const response = await attempt({ id, ...request });
        if (request.queueable && RETRYABLE(response.status)) {
          return { queued: true, entry: await enqueue(request, id, `HTTP ${response.status}`) };
        }
        return { queued: false, response };
      } catch (error) {
        if (!request.queueable) throw new OfflineUnavailableError(request.label);
        return { queued: true, entry: await enqueue(request, id, String((error as Error)?.message ?? error)) };
      }
    },

    flush,

    entries,

    /** The operator gives up a change that can never be applied. */
    async discard(id: string) {
      await deps.store.remove(id);
      await notify();
    },

    subscribe(listener: OutboxListener) {
      listeners.add(listener);
      void entries().then(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

/** In-memory store (tests, and the fallback when IndexedDB is unavailable). */
export function memoryStore(): OutboxStore {
  const map = new Map<string, OutboxEntry>();
  return {
    async all() {
      return [...map.values()].map((e) => ({ ...e }));
    },
    async put(entry) {
      map.set(entry.id, { ...entry });
    },
    async remove(id) {
      map.delete(id);
    },
    async clear() {
      map.clear();
    },
  };
}
