/**
 * Pay-at-the-table test in prod (2026-10-18): removing an item from a bill that already had a PIX was
 * refused by the server with 409. The outbox read every 409 as "still running, retry later": the
 * screen said "guardado neste aparelho", the change was replayed forever, the orange "Enviando 3
 * operações" bar never left and every later change of the comanda waited behind it.
 * Only the idempotency "still running" 409 (header Idempotency-Status: in-progress) is retried now;
 * any other 409 is a business refusal that reaches the screen.
 */
import { createOutbox, memoryStore } from '../../lib/offline/outbox';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const refusal = () => json(409, { error: 'Esta conta já tem pagamento: estorne antes de tirar itens' });
const stillRunning = () => json(409, { error: 'Operação ainda em processamento' }, { 'Idempotency-Status': 'in-progress' });
const req = { method: 'DELETE' as const, url: '/api/comanda/sessions/s1/items/i1', label: 'Remover Teste mesa', queueable: true };

describe('outbox: a business 409 is an answer, not a retry', () => {
  it('online, the refusal comes back to the screen and nothing is queued', async () => {
    const store = memoryStore();
    const outbox = createOutbox({ store, fetch: jest.fn().mockResolvedValue(refusal()) as any, isOnline: () => true });

    const result = await outbox.send(req);

    expect(result.queued).toBe(false);
    if (!result.queued) expect(result.response.status).toBe(409);
    expect(await store.all()).toHaveLength(0);
  });

  it('a queued change refused with 409 is marked failed with the reason and does not block the next one', async () => {
    let online = false;
    const fetchMock = jest.fn();
    const outbox = createOutbox({ store: memoryStore(), fetch: fetchMock as any, isOnline: () => online });
    await outbox.send(req);
    await outbox.send({ ...req, method: 'POST', url: '/api/comanda/sessions/s1/items', label: '1x Água' });
    online = true;
    fetchMock.mockResolvedValueOnce(refusal()).mockResolvedValueOnce(json(200, {}));

    const result = await outbox.flush();

    expect(result).toEqual({ sent: 1, failed: 1, pending: 0 });
    const [entry] = await outbox.entries();
    expect(entry.status).toBe('failed');
    expect(entry.lastError).toBe('Esta conta já tem pagamento: estorne antes de tirar itens');
  });

  it('the idempotency "still running" 409 is still kept and retried', async () => {
    const store = memoryStore();
    const outbox = createOutbox({ store, fetch: jest.fn().mockResolvedValue(stillRunning()) as any, isOnline: () => true });

    const result = await outbox.send(req);

    expect(result.queued).toBe(true);
    const [entry] = await store.all();
    expect(entry.status).toBe('pending');
  });
});
