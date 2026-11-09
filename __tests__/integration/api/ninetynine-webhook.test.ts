// @ts-nocheck
/** 99Food webhook: signed events are stored once, before any processing */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { POST } from '../../../app/api/integrations/99food/webhook/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const SECRET = 'test-secret-99';
const tag = crypto.randomBytes(4).toString('hex');
const BIG = '5764607523034234567'; // > 2^53, must survive as an exact string
let seq = 0;

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
const ts = () => 1760000000 + seq++ + Number.parseInt(tag, 16) % 100000;

function call(raw: string, sign?: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sign !== null) headers['didi-header-sign'] = sign ?? md5(raw + SECRET);
  return POST(new Request('http://localhost/api/integrations/99food/webhook', { method: 'POST', headers, body: raw }) as any);
}
const orderBody = (timestamp: number, extra = '') =>
  `{"app_id":123,"app_shop_id":"shop-${tag}","type":"orderCancel","timestamp":${timestamp},"data":{"order_id":${BIG}${extra}}}`;

describe('99Food webhook route', () => {
  const saved = { id: process.env.NINETYNINE_FOOD_APP_ID, secret: process.env.NINETYNINE_FOOD_APP_SECRET };
  beforeEach(() => {
    process.env.NINETYNINE_FOOD_APP_ID = 'app-1';
    process.env.NINETYNINE_FOOD_APP_SECRET = SECRET;
  });
  afterAll(async () => {
    await prisma.ninetynineEvent.deleteMany({ where: { appShopId: { contains: tag } } });
    await prisma.ninetynineEvent.deleteMany({ where: { id: { contains: tag } } });
    process.env.NINETYNINE_FOOD_APP_ID = saved.id;
    process.env.NINETYNINE_FOOD_APP_SECRET = saved.secret;
  });
  const rows = () => prisma.ninetynineEvent.findMany({ where: { appShopId: `shop-${tag}` } });

  it('rejects a bad or missing signature with 401 and stores nothing', async () => {
    const raw = orderBody(ts());
    expect((await call(raw, 'deadbeef')).status).toBe(401);
    expect((await call(raw, null)).status).toBe(401);
    expect(await rows()).toHaveLength(0);
  });

  it('stores a signed event with the exact order id and answers errno 0', async () => {
    const t = ts();
    const res = await call(orderBody(t));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/json/);
    expect(await res.json()).toEqual({ errno: 0, errmsg: 'ok' });
    const list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0].orderId).toBe(BIG);
    expect(list[0].type).toBe('orderCancel');
    expect(list[0].id).toBe(`orderCancel:${BIG}:${t}`);
    expect(list[0].processedAt).toBeNull();
  });

  it('collapses the same body sent twice into one row, and keeps apply ids apart', async () => {
    const t = ts();
    const raw = orderBody(t, ',"apply_id":777');
    expect((await call(raw)).status).toBe(200);
    expect((await call(raw)).status).toBe(200);
    expect((await prisma.ninetynineEvent.count({ where: { id: `orderCancel:${BIG}:${t}:777` } }))).toBe(1);
    await call(orderBody(t, ',"apply_id":778'));
    expect((await prisma.ninetynineEvent.count({ where: { id: { startsWith: `orderCancel:${BIG}:${t}:` } } }))).toBe(2);
  });

  it('keys shopBindStatus by the sorted shop list', async () => {
    const t = ts();
    const raw = `{"app_id":123,"type":"shopBindStatus","timestamp":${t},"data":{"appShopIDList":["b-${tag}","a-${tag}"],"bindStatus":"bind"}}`;
    expect((await call(raw)).status).toBe(200);
    expect(await prisma.ninetynineEvent.count({ where: { id: `shopBindStatus:a-${tag},b-${tag}:${t}` } })).toBe(1);
  });

  it('answers 400 for a signed body that is not JSON, storing nothing', async () => {
    const res = await call('not json {');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errno: 1, errmsg: 'bad json' });
    expect((await call('[1,2]')).status).toBe(400);
  });

  it('answers 503 when 99Food is not configured', async () => {
    delete process.env.NINETYNINE_FOOD_APP_ID;
    delete process.env.NINETYNINE_FOOD_APP_SECRET;
    const before = await prisma.ninetynineEvent.count();
    expect((await call(orderBody(ts()))).status).toBe(503);
    expect(await prisma.ninetynineEvent.count()).toBe(before);
  });

  describe('body size cap', () => {
    const url = 'http://localhost/api/integrations/99food/webhook';
    const streamOf = (raw: string, size = 1000) =>
      new ReadableStream({
        start(c) {
          const b = Buffer.from(raw);
          for (let i = 0; i < b.length; i += size) c.enqueue(new Uint8Array(b.subarray(i, i + size)));
          c.close();
        },
      });
    it('413 when content-length is over 1 MB, nothing stored', async () => {
      const before = await prisma.ninetynineEvent.count();
      const raw = orderBody(ts());
      const res = await POST(new Request(url, { method: 'POST', headers: { 'content-length': '1048577', 'didi-header-sign': md5(raw + SECRET) }, body: raw }) as any);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ errno: 1, errmsg: 'too large' });
      expect(await prisma.ninetynineEvent.count()).toBe(before);
    });
    it('413 when a streamed body without content-length passes 1 MB', async () => {
      const raw = 'x'.repeat(1_048_577);
      const res = await POST(new Request(url, { method: 'POST', headers: { 'didi-header-sign': md5(raw + SECRET) }, body: streamOf(raw, 65536), duplex: 'half' } as any) as any);
      expect(res.status).toBe(413);
    });
    it('200 and stored for a small streamed signed body', async () => {
      const t = ts();
      const raw = orderBody(t);
      const res = await POST(new Request(url, { method: 'POST', headers: { 'didi-header-sign': md5(raw + SECRET) }, body: streamOf(raw, 30), duplex: 'half' } as any) as any);
      expect(res.status).toBe(200);
      expect(await prisma.ninetynineEvent.count({ where: { id: `orderCancel:${BIG}:${t}` } })).toBe(1);
    });
  });
});
