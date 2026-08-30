// @ts-nocheck
/**
 * Unified Application Cache Layer
 *
 * Priority order:
 *   1. Redis (ioredis) — when REDIS_URL env is set AND ioredis package is installed
 *   2. In-memory LRU cache (lru-cache) — default, survives within a single process
 *
 * Usage:
 *   import { cache } from '@/lib/cache';
 *   await cache.set('key', value, 60); // ttl in seconds
 *   const v = await cache.get<MyType>('key');
 *   await cache.del('key');
 *   await cache.clear('prefix:*'); // wildcard supported
 *
 * Helpers:
 *   cached(key, ttl, factory)       - read-through cache
 *   invalidate(pattern)             - invalidate by key or pattern
 */

import LRUCache from 'lru-cache';

type SerializedValue = string;

export interface CacheDriver {
  readonly name: 'redis' | 'memory';
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(keys: string | string[]): Promise<void>;
  clear(pattern?: string): Promise<void>;
  has(key: string): Promise<boolean>;
  stats(): Promise<{ size: number; hits: number; misses: number; driver: string }>;
}

/* -------------------- in-memory LRU driver -------------------- */

class MemoryDriver implements CacheDriver {
  readonly name = 'memory' as const;
  private lru: LRUCache<string, SerializedValue>;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.lru = new LRUCache<string, SerializedValue>({
      max: 5000, // max ~5k keys
      ttl: 1000 * 60 * 5, // default 5 min
      ttlAutopurge: true,
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = this.lru.get(key);
    if (raw === undefined) {
      this.misses++;
      return null;
    }
    this.hits++;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    const ttlMs = typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds * 1000 : undefined;
    if (ttlMs) {
      // lru-cache v5 uses maxAge as a direct number argument, not an options object
      this.lru.set(key, payload, ttlMs);
    } else {
      this.lru.set(key, payload);
    }
  }

  async del(keys: string | string[]): Promise<void> {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) this.lru.delete(k);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.lru.clear();
      return;
    }
    const regex = globToRegex(pattern);
    for (const key of Array.from(this.lru.keys())) {
      if (regex.test(key)) this.lru.delete(key);
    }
  }

  async has(key: string): Promise<boolean> {
    return this.lru.has(key);
  }

  async stats() {
    return {
      size: this.lru.size,
      hits: this.hits,
      misses: this.misses,
      driver: this.name,
    };
  }
}

/* -------------------- Redis driver (dynamic) -------------------- */

class RedisDriver implements CacheDriver {
  readonly name = 'redis' as const;
  private client: any;
  private hits = 0;
  private misses = 0;

  constructor(client: any) {
    this.client = client;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null || raw === undefined) {
      this.misses++;
      return null;
    }
    this.hits++;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  async del(keys: string | string[]): Promise<void> {
    const arr = Array.isArray(keys) ? keys : [keys];
    if (arr.length === 0) return;
    await this.client.del(...arr);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      await this.client.flushdb();
      return;
    }
    // SCAN + DEL to safely match large key spaces
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = reply[0];
      const keys: string[] = reply[1] || [];
      if (keys.length) await this.client.del(...keys);
    } while (cursor !== '0');
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async stats() {
    let size = 0;
    try {
      size = await this.client.dbsize();
    } catch {
      /* ignore */
    }
    return {
      size,
      hits: this.hits,
      misses: this.misses,
      driver: this.name,
    };
  }
}

/* -------------------- driver bootstrap -------------------- */

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function loadRedisDriver(): CacheDriver | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // Attempt to dynamically load ioredis — optional dep.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IORedis = require('ioredis');
    const Ctor = IORedis?.default ?? IORedis;
    const client = new Ctor(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      lazyConnect: false,
    });
    client.on('error', (err: any) => {
      console.warn('[cache] Redis error:', err?.message || err);
    });
    console.log('[cache] Using Redis driver');
    return new RedisDriver(client);
  } catch (err: any) {
    console.warn(
      '[cache] REDIS_URL is set but ioredis is not installed. Run `yarn add ioredis` to enable Redis. Falling back to in-memory cache.'
    );
    return null;
  }
}

const globalForCache = globalThis as unknown as {
  __cacheDriver?: CacheDriver;
};

function buildDriver(): CacheDriver {
  const redis = loadRedisDriver();
  if (redis) return redis;
  console.log('[cache] Using in-memory LRU driver');
  return new MemoryDriver();
}

export const cache: CacheDriver =
  globalForCache.__cacheDriver || (globalForCache.__cacheDriver = buildDriver());

/* -------------------- convenience helpers -------------------- */

/**
 * Read-through cache helper.
 * Returns the cached value if present, otherwise calls `factory`, caches, and returns.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await factory();
  await cache.set(key, value, ttlSeconds);
  return value;
}

/**
 * Invalidate one key or a glob pattern.
 */
export async function invalidate(keyOrPattern: string): Promise<void> {
  if (keyOrPattern.includes('*') || keyOrPattern.includes('?')) {
    await cache.clear(keyOrPattern);
    return;
  }
  await cache.del(keyOrPattern);
}

/**
 * Namespaced key builder to keep keys consistent.
 */
export function cacheKey(namespace: string, ...parts: (string | number | undefined | null)[]): string {
  const safe = parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map((p) => String(p).replace(/\s+/g, '_'));
  return [namespace, ...safe].join(':');
}

export const CACHE_TTL = {
  TINY: 10, // 10 s — hot metrics
  SHORT: 60, // 1 min
  MEDIUM: 60 * 5, // 5 min
  LONG: 60 * 60, // 1 h
  XLONG: 60 * 60 * 24, // 24 h
} as const;
