import { randomBytes } from 'crypto';
import JSONbig from 'json-bigint';

/**
 * 99Food ids (app_id, order_id, shop_id, apply_id) are 64-bit and lose digits in a plain JSON.parse. Every 99Food body goes
 * through here: big integers come back as strings (numbers up to 15 digits stay numbers, so callers wrap ids in String()).
 */
const parser = JSONbig({ storeAsString: true });

export function parseBig(raw: string): any {
  return parser.parse(raw);
}

/** JSON.stringify that writes the listed keys (any depth) as raw number literals, so a 64-bit id is sent without rounding */
export function stringifyBig(value: unknown, bigKeys: string[]): string {
  const keys = new Set(bigKeys);
  // A random marker per call, so no payload text can collide with it
  const mark = `__99BIG${randomBytes(8).toString('hex')}__`;
  const markRe = new RegExp(`"${mark}(\\d+)${mark}"`, 'g');
  const text = JSON.stringify(value, (key: string, v: unknown) => {
    if (!keys.has(key) || v === undefined || v === null) return v;
    if (typeof v === 'number' && Number.isSafeInteger(v)) return `${mark}${v}${mark}`;
    if (typeof v === 'string' && /^\d+$/.test(v)) return `${mark}${v}${mark}`;
    throw new Error(`99Food: o campo ${key} precisa ser um número inteiro`);
  });
  return text.replace(markRe, '$1');
}
