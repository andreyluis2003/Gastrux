/** iFood client: tokens and endpoints (plan 2026-10-24 ifood, Task 2) */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
import { ifoodTransport, IfoodError, pollEvents, ackEvents, getOrder, resetIfoodTokenCache } from '@/lib/ifood/client';

type Req = { method: string; path: string; headers: Record<string, string>; body?: string };

describe('iFood client (centralized)', () => {
  let calls: Req[];
  let answer: (r: Req) => { status: number; text: string };
  beforeEach(() => {
    process.env.IFOOD_APP_MODE = 'centralized';
    process.env.IFOOD_CLIENT_ID = 'cid';
    process.env.IFOOD_CLIENT_SECRET = 'sec';
    resetIfoodTokenCache();
    calls = [];
    jest.spyOn(ifoodTransport, 'request').mockImplementation(async (r: Req) => { calls.push(r); return answer(r); });
  });
  afterEach(() => jest.restoreAllMocks());
  const token = (r: Req) => r.path.startsWith('/authentication/v1.0/oauth/token');
  let n = 0;
  const tokenAnswer = () => ({ status: 200, text: JSON.stringify({ accessToken: `t${++n}`, expiresIn: 21600 }) });

  it('centralized: one token for two calls', async () => {
    answer = (r) => (token(r) ? tokenAnswer() : { status: 200, text: '{"id":"o1"}' });
    await getOrder(null, 'o1');
    await getOrder(null, 'o2');
    expect(calls.filter(token)).toHaveLength(1);
    const body = new URLSearchParams(calls.find(token)!.body);
    expect(body.get('grantType')).toBe('client_credentials');
    expect(body.get('clientId')).toBe('cid');
    expect(calls[1].headers.Authorization).toMatch(/^Bearer t\d+$/);
    expect(calls[1].path).toBe('/order/v1.0/orders/o1');
  });

  it('a 401 renews once and retries once', async () => {
    let orderCalls = 0;
    answer = (r) => (token(r) ? tokenAnswer() : ++orderCalls === 1 ? { status: 401, text: '' } : { status: 200, text: '{"id":"o1"}' });
    expect(await getOrder(null, 'o1')).toEqual({ id: 'o1' });
    expect(calls.filter(token)).toHaveLength(2);

    resetIfoodTokenCache();
    calls = [];
    answer = (r) => (token(r) ? tokenAnswer() : { status: 401, text: '' });
    await expect(getOrder(null, 'o1')).rejects.toMatchObject({ status: 401 });
    await expect(getOrder(null, 'o1')).rejects.toBeInstanceOf(IfoodError);
    // two failed calls: each renews at most once (no loop)
    expect(calls.filter((r) => !token(r)).length).toBe(4);
  });

  it('204 polling is an empty list, and the merchants go in x-polling-merchants', async () => {
    answer = (r) => (token(r) ? tokenAnswer() : { status: 204, text: '' });
    expect(await pollEvents(null, ['m1', 'm2'])).toEqual([]);
    const poll = calls.find((r) => !token(r))!;
    expect(poll.path).toBe('/events/v1.0/events:polling');
    expect(poll.headers['x-polling-merchants']).toBe('m1,m2');
  });

  it('ack splits 2500 ids into 2000 + 500', async () => {
    answer = (r) => (token(r) ? tokenAnswer() : { status: 202, text: '' });
    await ackEvents(null, Array.from({ length: 2500 }, (_, i) => `e${i}`));
    const acks = calls.filter((r) => r.path === '/events/v1.0/events/acknowledgment');
    expect(acks.map((a) => JSON.parse(a.body!).length)).toEqual([2000, 500]);
    expect(JSON.parse(acks[0].body!)[0]).toEqual({ id: 'e0' });
  });

  it('another error throws with the status', async () => {
    answer = (r) => (token(r) ? tokenAnswer() : { status: 500, text: 'boom' });
    await expect(getOrder(null, 'o1')).rejects.toMatchObject({ status: 500 });
  });
});
