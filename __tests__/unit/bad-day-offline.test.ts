// @ts-nocheck
/**
 * "Bad day" scenario 1 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md): the internet
 * drops and comes back. DB-free: the service worker (public/sw.js) runs inside a vm with fake caches, the
 * sync manager runs with a mocked IndexedDB layer and fetch. Each case states the DESIRED behaviour; a case
 * that documents a known gap is `it.failing` (green suite, flips to a failure when the gap is fixed).
 *
 * Owner decision 2026-09-24: offline option (a) (market practice for cloud POS). All gaps below are fixed:
 *   O1  nothing was queued offline (the old offline-storage / sync-manager were wired to nothing and sent
 *       to wrong URLs): now lib/offline/outbox.ts, kept in IndexedDB, mounted in the root layout and used
 *       by the comanda and the counter sale; the queue lives in the APP, not in the service worker
 *       (background sync is not available everywhere), so the SW still does not touch POSTs
 *   O2  every GET /api/* was cached and served offline as live, never cleared on logout: now only the
 *       offline screens' reads are cached, served marked stale, and logout clears the caches
 *   O3  retries had no idempotency key and repeated 4xx: now one Idempotency-Key per change (the server
 *       stores the answer, lib/api/idempotency.ts) and a 4xx is marked failed, shown, discardable
 * Server side of the replays: __tests__/integration/bad-day/offline-replay.test.ts.
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
  it('a response served from the cache while offline is marked as STALE (O2)', async () => {
    const sw = loadServiceWorker();
    sw.state.network.set(KDS, () => new Response('{"orders":[]}', { status: 200 }));
    await sw.dispatchFetch(KDS);
    sw.state.online = false;

    const { response } = await sw.dispatchFetch(KDS);

    expect(response.headers.get('x-gastrux-cache') === 'stale' || response.headers.get('x-served-from-cache') === 'true').toBe(true);
  });

  // O2: the cache is never purged on logout: the app never posts CLEAR_CACHE, so the next user of the device
  // reads the previous user's API responses while offline.
  it('logging out clears the cached API responses (the app asks the service worker to do it) (O2)', () => {
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

  // By design: the outbox lives in the app (lib/offline/outbox.ts); the service worker never touches a POST.
  it('a POST made offline is NOT intercepted by the service worker (the app outbox keeps it)', async () => {
    const sw = loadServiceWorker();
    sw.state.online = false;

    const { intercepted } = await sw.dispatchFetch('https://gastrux.test/api/comanda/sessions/s1/items', 'POST');

    expect(intercepted).toBe(false);
  });

  it('an API outside the offline screens is never cached: offline it is an honest 503 (O2)', async () => {
    const sw = loadServiceWorker();
    const REPORT = 'https://gastrux.test/api/reports/executive';
    sw.state.network.set(REPORT, () => new Response('{"revenue":1}', { status: 200 }));
    await sw.dispatchFetch(REPORT);
    sw.state.online = false;

    const { response } = await sw.dispatchFetch(REPORT);

    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/Sem internet/);
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
  const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

  it('the outbox is mounted for every screen (root layout) (O1)', () => {
    expect(read('app/layout.tsx')).toContain('<OutboxProvider>');
  });

  it('the comanda and the counter sale send their changes through the outbox (O1)', () => {
    expect(read('app/comanda/[sessionId]/page.tsx')).toMatch(/useOutbox\(\)/);
    expect(read('components/comanda/counter-sale.tsx')).toMatch(/queueable: true/);
  });

  it('the offline banner says what keeps working, what does not and what is waiting', () => {
    const banner = read('components/offline-indicator.tsx');
    expect(banner).toMatch(/aguardando envio/);
    expect(banner).toMatch(/indisponíveis/);
    expect(banner).not.toMatch(/No internet connection/); // the old English text shown on screen
  });

  it('the dead offline modules (wired to nothing, wrong URLs) are gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/sync-manager.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'lib/offline-storage.ts'))).toBe(false);
  });
});

// ---------- device outbox ----------
import { createOutbox, memoryStore, OfflineUnavailableError } from '../../lib/offline/outbox';

describe('bad day 1: the device outbox', () => {
  const setup = (opts: { online?: boolean; fetch?: jest.Mock } = {}) => {
    const state = { online: opts.online ?? true };
    let n = 0;
    const fetchMock = opts.fetch ?? jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const sent: string[] = [];
    const outbox = createOutbox({
      store: memoryStore(),
      fetch: fetchMock as any,
      isOnline: () => state.online,
      newKey: () => `key-${++n}`,
      now: () => n * 1000,
      onSent: (entry) => sent.push(entry.id),
    });
    return { outbox, state, fetchMock, sent };
  };
  const item = (label = 'Adicionar item') => ({
    method: 'POST' as const,
    url: '/api/comanda/sessions/s1/items',
    body: { recipeId: 'r1' },
    label,
    scope: 's1',
    queueable: true,
  });
  const keyOf = (call: any[]) => new Headers(call[1].headers).get('idempotency-key');

  it('online, a change is sent at once with an Idempotency-Key', async () => {
    const { outbox, fetchMock } = setup();

    const result = await outbox.send(item());

    expect(result.queued).toBe(false);
    expect(keyOf(fetchMock.mock.calls[0])).toBe('key-1');
    expect(await outbox.entries()).toHaveLength(0);
  });

  it('offline, a comanda change is kept on the device (O1)', async () => {
    const { outbox, fetchMock } = setup({ online: false });

    const result = await outbox.send(item());

    expect(result.queued).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await outbox.entries()).map((e) => e.status)).toEqual(['pending']);
  });

  it('a network error while "online" also keeps the change (the answer may be lost)', async () => {
    const { outbox } = setup({ fetch: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) });

    expect((await outbox.send(item())).queued).toBe(true);
  });

  it('offline, what needs the internet (PIX, NFC-e, reports) is refused honestly, never queued', async () => {
    const { outbox } = setup({ online: false });

    await expect(outbox.send({ ...item('Gerar PIX'), url: '/api/pagamentos/mp/pix', queueable: false })).rejects.toBeInstanceOf(OfflineUnavailableError);
    expect(await outbox.entries()).toHaveLength(0);
  });

  it('when the connection returns, the changes are sent in order and removed', async () => {
    const { outbox, state, fetchMock, sent } = setup({ online: false });
    await outbox.send(item('1'));
    await outbox.send({ ...item('2'), url: '/api/comanda/sessions/s1/send-to-kitchen' });
    state.online = true;

    const result = await outbox.flush();

    expect(result).toEqual({ sent: 2, failed: 0, pending: 0 });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/comanda/sessions/s1/items', '/api/comanda/sessions/s1/send-to-kitchen']);
    expect(sent).toEqual(['key-1', 'key-2']);
  });

  it('every attempt of a change carries the same idempotency key (O3)', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new TypeError('response lost')).mockResolvedValue(new Response('{}', { status: 201 }));
    const { outbox } = setup({ fetch: fetchMock });

    await outbox.send(item());
    await outbox.flush();

    expect(fetchMock.mock.calls.map(keyOf)).toEqual(['key-1', 'key-1']);
  });

  it('a definite client error (4xx) is not retried: it is marked failed for the operator (O3)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Comanda fechada ou cancelada' }), { status: 409 }));
    const { outbox, state } = setup({ online: false, fetch: fetchMock });
    await outbox.send(item());
    state.online = true;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 }));

    const first = await outbox.flush();
    const second = await outbox.flush();

    expect(first.failed).toBe(1);
    expect(second.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [entry] = await outbox.entries();
    expect(entry.status).toBe('failed');
    expect(entry.lastError).toBe('Session not found');
  });

  it('a 5xx or 409 "still running" keeps the change and stops the run (order is kept)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    const { outbox, state } = setup({ online: false, fetch: fetchMock });
    await outbox.send(item('1'));
    await outbox.send(item('2'));
    state.online = true;

    const result = await outbox.flush();

    expect(result).toEqual({ sent: 0, failed: 0, pending: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('online, a new change waits behind older ones (an item before "send to kitchen")', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const { outbox, state } = setup({ online: false, fetch: fetchMock });
    await outbox.send(item('1'));
    state.online = true;

    const result = await outbox.send({ ...item('2'), url: '/api/comanda/sessions/s1/send-to-kitchen' });
    await outbox.flush();

    expect(result.queued).toBe(true);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/comanda/sessions/s1/items', '/api/comanda/sessions/s1/send-to-kitchen']);
  });

  it('two runs at the same time do not replay the queue twice', async () => {
    const { outbox, state, fetchMock } = setup({ online: false });
    await outbox.send(item());
    state.online = true;

    await Promise.all([outbox.flush(), outbox.flush()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the operator can discard a change that can never be applied', async () => {
    const { outbox } = setup({ online: false });
    const { entry } = (await outbox.send(item())) as any;

    await outbox.discard(entry.id);

    expect(await outbox.entries()).toHaveLength(0);
  });

  it.todo('an edit made offline does not silently overwrite a newer change made online (needs a version check, "last writer wins" today)');
});
