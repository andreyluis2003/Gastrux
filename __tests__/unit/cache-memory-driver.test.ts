/**
 * The in-memory cache used when Redis is off (final review of the plans, 2026-10-18): it called lru.delete,
 * lru.clear and lru.size, which the lru-cache 5 that npm resolves does not have (del, reset, length), so
 * every platform action that clears a client's cache (suspend, reactivate, change plan) answered 500.
 */
const savedRedis = process.env.REDIS_URL;
delete process.env.REDIS_URL;
import { cache, invalidate } from '@/lib/cache';

afterAll(() => {
  if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis;
});

it('memory driver: set, delete one key, clear by pattern, stats', async () => {
  expect(cache.name).toBe('memory');
  await cache.set('customer:details:a', { a: 1 });
  await cache.set('customer:details:b', { b: 2 });
  await cache.set('platform:metrics:v1', { m: 1 });
  await invalidate('customer:details:a');
  expect(await cache.get('customer:details:a')).toBeNull();
  expect(await cache.get('customer:details:b')).toEqual({ b: 2 });
  await invalidate('customer:*');
  expect(await cache.has('customer:details:b')).toBe(false);
  expect(await cache.has('platform:metrics:v1')).toBe(true);
  expect((await cache.stats()).size).toBe(1);
  await cache.clear();
  expect(await cache.has('platform:metrics:v1')).toBe(false);
});
