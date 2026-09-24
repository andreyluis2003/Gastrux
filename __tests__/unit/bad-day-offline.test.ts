// @ts-nocheck
/**
 * "Bad day" scenario 1 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md): the internet
 * drops and comes back. DB-free: the service worker (public/sw.js) runs inside a vm with fake caches, the
 * sync manager runs with a mocked IndexedDB layer and fetch. Each case states the DESIRED behaviour; a case
 * that documents a known gap is `it.failing` (green suite, flips to a failure when the gap is fixed).
 *
 * Gaps, by priority:
 *   O1 P0  nothing is queued offline: no app code creates a pending change or starts the sync, and the SW
 *          ignores every non-GET request, so an order, a comanda item or a payment made offline is simply lost
 *          while the banner says "App working offline"
 *   O2 P0  every GET /api/* response is cached and served offline as if it were live (no stale marker), and the
 *          cache is never cleared on logout, so the kitchen can see old orders as current and a second user on
 *          the same device can read the first one's cached data
 *   O3 P1  the (unused) sync manager retries a change with no idempotency key and retries 4xx answers
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = path.resolve(__dirname, '../..');

// ---------- service worker harness ----------
function loadServiceWorker() {
  const listeners: Record<string, Function[]> = {};
  const stores = new Map<string, Map<string, Response>>();
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(req: any) {
          const hit = store.get(typeof req === 'string' ? req : req.url);
          return hit ? hit.clone() : undefined;
        },
        async put(req: any, res: Response) {
          store.set(typeof req === 'string' ? req : req.url, res);
        },
        async addAll() {},
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  const state = { online: true, network: new Map<string, () => Response>() };
  const fetchImpl = async (req: any) => {
    if (!state.online) throw new TypeError('Failed to fetch');
    const make = state.network.get(req.url);
    return make ? make() : new Response('{}', { status: 200 });
  };
  const self: any = {
    addEventListener: (type: string, fn: Function) => (listeners[type] ||= []).push(fn),
    skipWaiting() {},
    clients: { matchAll: async () => [], claim: async () => {} },
  };
  const sandbox: any = { self, caches, fetch: fetchImpl, Response, URL, Headers, console: { log() {}, error() {}, warn() {} }, Promise, JSON };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8'), sandbox);

  const dispatchFetch = async (url: string, method = 'GET') => {
    const event: any = { request: { url, method, headers: new Headers() }, respondWith(p: any) { this.answer = p; } };
    (listeners.fetch || []).forEach((fn) => fn(event));
    return { intercepted: !!event.answer, response: event.answer ? await event.answer : undefined };
  };
  const message = (data: any) => (listeners.message || []).forEach((fn) => fn({ data }));
  return { state, stores, dispatchFetch, message };
}

describe('bad day 1: service worker while the internet is down', () => {
  const KDS = 'https://gastrux.test/api/kds/orders';

  it('an uncached API request answers a clear 503 "offline" instead of hanging', async () => {
    const sw = loadServiceWorker();
    sw.state.online = false;

    const { response } = await sw.dispatchFetch(KDS);

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('offline');
  });

  it('online GETs are cached and the SAME data is served when the network fails', async () => {
    const sw = loadServiceWorker();
    sw.state.network.set(KDS, () => new Response(JSON.stringify({ orders: [{ id: 'old' }] }), { status: 200 }));
    await sw.dispatchFetch(KDS);
    sw.state.online = false;

    const { response } = await sw.dispatchFetch(KDS);

    expect(response.status).toBe(200);
    expect((await response.json()).orders[0].id).toBe('old');
  });

  // O2: an old kitchen list is answered as a normal 200: nothing tells the screen the data is stale.
  it.failing('a response served from the cache while offline is marked as STALE (O2)', async () => {
    const sw = loadServiceWorker();
    sw.state.network.set(KDS, () => new Response('{"orders":[]}', { status: 200 }));
    await sw.dispatchFetch(KDS);
    sw.state.online = false;

    const { response } = await sw.dispatchFetch(KDS);

    expect(response.headers.get('x-gastrux-cache') === 'stale' || response.headers.get('x-served-from-cache') === 'true').toBe(true);
  });

  // O2: the cache is never purged on logout: the app never posts CLEAR_CACHE, so the next user of the device
  // reads the previous user's API responses while offline.
  it.failing('logging out clears the cached API responses (the app asks the service worker to do it) (O2)', () => {
    const sources = walk(['app', 'components', 'hooks', 'lib']).filter((f) => !f.endsWith('sw.js'));
    const asksToClear = sources.some((f) => fs.readFileSync(f, 'utf8').includes('CLEAR_CACHE'));
    expect(asksToClear).toBe(true);
  });

  it('the CLEAR_CACHE message does empty every cache (so wiring it to logout would work)', async () => {
    const sw = loadServiceWorker();
    sw.state.network.set(KDS, () => new Response('{"orders":[{"id":"a"}]}', { status: 200 }));
    await sw.dispatchFetch(KDS);
    expect(sw.stores.size).toBeGreaterThan(0);

    sw.message({ type: 'CLEAR_CACHE' });
    await new Promise((r) => setTimeout(r, 0));

    expect(sw.stores.size).toBe(0);
  });

  // O1: a POST (a new order, a comanda item, a PIX) is not touched by the service worker: offline, it just fails.
  it('a POST made offline is NOT intercepted by the service worker (nothing is queued)', async () => {
    const sw = loadServiceWorker();
    sw.state.online = false;

    const { intercepted } = await sw.dispatchFetch('https://gastrux.test/api/comanda/sessions/s1/items', 'POST');

    expect(intercepted).toBe(false);
  });

  it.failing('a POST that failed offline is kept and replayed when the connection returns (O1)', async () => {
    const sw = loadServiceWorker();
    sw.state.online = false;

    const { intercepted } = await sw.dispatchFetch('https://gastrux.test/api/comanda/sessions/s1/items', 'POST');

    expect(intercepted).toBe(true);
  });
});

// ---------- wiring: is the offline queue used at all? ----------
function walk(dirs: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(ts|tsx|js)$/.test(entry.name)) out.push(full);
    }
  };
  dirs.forEach((d) => fs.existsSync(path.join(ROOT, d)) && visit(path.join(ROOT, d)));
  return out;
}

describe('bad day 1: is the offline queue wired to anything?', () => {
  const usedOutside = (symbol: string, definedIn: string[]) =>
    walk(['app', 'components', 'hooks', 'lib', 'public'])
      .filter((f) => !definedIn.some((d) => f.endsWith(d)))
      .some((f) => new RegExp(`\\b${symbol}\\b`).test(fs.readFileSync(f, 'utf8')));

  it.failing('some screen queues a change when the network is down (addPendingChange has a caller) (O1)', () => {
    expect(usedOutside('addPendingChange', ['offline-storage.ts', 'sync-manager.ts'])).toBe(true);
  });

  it.failing('the IndexedDB store is initialised by the app (initializeOfflineStorage has a caller) (O1)', () => {
    expect(usedOutside('initializeOfflineStorage', ['offline-storage.ts', 'sync-manager.ts'])).toBe(true);
  });

  it.failing('the sync manager is imported, so it really syncs when the connection returns (O1)', () => {
    expect(usedOutside('syncManager', ['sync-manager.ts'])).toBe(true);
  });

  it('only the online/offline banner is wired (it reads navigator.onLine and says nothing about queued work)', () => {
    const banner = fs.readFileSync(path.join(ROOT, 'components/offline-indicator.tsx'), 'utf8');
    expect(banner).toContain('navigator.onLine');
    expect(banner).not.toMatch(/pending|queued|fila/i);
  });
});

// ---------- sync manager ----------
jest.mock('../../lib/offline-storage', () => ({
  getPendingChanges: jest.fn(),
  markChangeAsSynced: jest.fn().mockResolvedValue(undefined),
  updateSyncMetadata: jest.fn().mockResolvedValue(undefined),
}));

import { getPendingChanges, markChangeAsSynced } from '../../lib/offline-storage';
import { syncManager } from '../../lib/sync-manager';

describe('bad day 1: replaying queued changes when the connection returns', () => {
  const change = (over: any = {}) => ({
    id: 'stock-1700000000000-abc',
    type: 'stock',
    action: 'create',
    data: { id: '', quantity: 5 },
    timestamp: new Date().toISOString(),
    synced: false,
    ...over,
  });
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('a change that goes through is marked as synced', async () => {
    getPendingChanges.mockResolvedValue([change()]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    expect(await syncManager.syncPendingChanges()).toBe(true);

    expect(markChangeAsSynced).toHaveBeenCalledWith('stock-1700000000000-abc');
  });

  it('a change that keeps failing stays pending (nothing is lost) and the run reports the error', async () => {
    getPendingChanges.mockResolvedValue([change()]);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await syncManager.syncPendingChanges()).toBe(false);

    expect(markChangeAsSynced).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('one failing change does not stop the next ones', async () => {
    getPendingChanges.mockResolvedValue([change({ id: 'stock-1-a' }), change({ id: 'stock-2-b', data: { id: 'x' } })]);
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('x'))
      .mockRejectedValueOnce(new TypeError('x'))
      .mockRejectedValueOnce(new TypeError('x'))
      .mockResolvedValue({ ok: true, status: 200 });

    await syncManager.syncPendingChanges();

    expect(markChangeAsSynced).toHaveBeenCalledTimes(1);
    expect(markChangeAsSynced).toHaveBeenCalledWith('stock-2-b');
  });

  // O3: the server may have applied the request and only the ANSWER was lost; the retry then repeats a create.
  it.failing('every attempt of a change carries the same idempotency key, so a repeated request can be ignored (O3)', async () => {
    getPendingChanges.mockResolvedValue([change()]);
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValue({ ok: true, status: 201 });

    await syncManager.syncPendingChanges();

    const keys = global.fetch.mock.calls.map(([, init]) => new Headers(init.headers).get('idempotency-key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  // O3: a 400/409/422 will never succeed by repeating it.
  it.failing('a definite client error (4xx) is not retried (O3)', async () => {
    getPendingChanges.mockResolvedValue([change()]);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, statusText: 'Unprocessable' });

    await syncManager.syncPendingChanges();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('two runs at the same time do not replay the queue twice', async () => {
    getPendingChanges.mockResolvedValue([change()]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const [a, b] = await Promise.all([syncManager.syncPendingChanges(), syncManager.syncPendingChanges()]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.todo('an edit made offline does not silently overwrite a newer change made online (needs a version check, "last writer wins" today)');
  it.todo('a change that can never be applied is shown to the operator and can be discarded, instead of being retried at every reconnect');
  it.todo('the offline banner says what is waiting to be sent and that nothing was saved for orders or payments');
});
