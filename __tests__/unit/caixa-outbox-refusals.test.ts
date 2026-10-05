/**
 * Cash refusals must reach the cashier (final review of 2026-10-05): "Abra o caixa" or "Esta conta já
 * foi fechada" answered 409, which the device outbox treats as "still running, retry later". The sale
 * was queued as if offline, replayed forever with the same stored answer and blocked the queue behind it.
 * They answer 422 now: a queueable change gets the answer back at once and nothing is queued.
 */
import { createOutbox, memoryStore } from '../../lib/offline/outbox';

const refusal = (code: string) =>
  new Response(JSON.stringify({ error: 'Abra o caixa para receber', code }), { status: 422, headers: { 'Content-Type': 'application/json' } });

describe('outbox and cash refusals', () => {
  it.each(['CASH_SESSION_REQUIRED', 'ALREADY_CLOSED'])('a 422 %s is answered, never queued', async (code) => {
    const store = memoryStore();
    const outbox = createOutbox({ store, fetch: jest.fn().mockResolvedValue(refusal(code)) as any, isOnline: () => true });

    const result = await outbox.send({ method: 'POST', url: '/api/comanda/quick-sale', body: {}, label: 'Venda', queueable: true });

    expect(result.queued).toBe(false);
    if (!result.queued) expect(result.response.status).toBe(422);
    expect(await store.all()).toHaveLength(0);
  });
});
