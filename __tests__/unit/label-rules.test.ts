import { computeExpiry, daysFor, storagesOf, parseShelfLifeDays } from '../../lib/labels/rules';

const item = (a: number | null, c: number | null, f: number | null) => ({ shelfLifeAmbientDays: a, shelfLifeChilledDays: c, shelfLifeFrozenDays: f });

describe('label rules (lib/labels/rules.ts)', () => {
  it('0 days = 23:59 of the same Brasília day, even late at night', () => {
    // 23:30 BRT on 2026-10-12 = 02:30 UTC on 2026-10-13
    const prepared = new Date('2026-10-13T02:30:00.000Z');
    expect(computeExpiry(prepared, 0).toISOString()).toBe('2026-10-13T02:59:00.000Z');
  });

  it('0 days early in the morning is still that day', () => {
    const prepared = new Date('2026-10-12T09:00:00.000Z'); // 06:00 BRT
    expect(computeExpiry(prepared, 0).toISOString()).toBe('2026-10-13T02:59:00.000Z');
  });

  it('N days = N x 24 h after the preparation, across months', () => {
    expect(computeExpiry(new Date('2026-10-30T17:30:00.000Z'), 3).toISOString()).toBe('2026-11-02T17:30:00.000Z');
  });

  it('only the storages with days are offered', () => {
    expect(storagesOf(item(null, 3, null))).toEqual(['CHILLED']);
    expect(storagesOf(item(0, 3, 30))).toEqual(['AMBIENT', 'CHILLED', 'FROZEN']);
    expect(storagesOf(item(null, null, null))).toEqual([]);
    expect(daysFor(item(0, 3, 30), 'FROZEN')).toBe(30);
    expect(daysFor(item(null, 3, null), 'AMBIENT')).toBeNull();
  });

  it('shelf life input: empty = not applicable, integers 0 to 365', () => {
    expect(parseShelfLifeDays('')).toBeNull();
    expect(parseShelfLifeDays(null)).toBeNull();
    expect(parseShelfLifeDays('3')).toBe(3);
    expect(parseShelfLifeDays(0)).toBe(0);
    expect(() => parseShelfLifeDays(-1)).toThrow('Validade em dias');
    expect(() => parseShelfLifeDays(2.5)).toThrow('Validade em dias');
    expect(() => parseShelfLifeDays(400)).toThrow('Validade em dias');
  });
});

import { brtInputToIso, isoToBrtInput } from '../../lib/labels/rules';
import { TapKey } from '../../lib/labels/tap-key';

describe('manual date in Brasília time, whatever the device timezone (review 2026-10-09)', () => {
  it('a datetime-local value is read as Brasília time', () => {
    expect(brtInputToIso('2026-10-12T18:00')).toBe('2026-10-12T21:00:00.000Z');
  });
  it('an instant is shown as Brasília time in the input', () => {
    expect(isoToBrtInput(new Date('2026-10-12T21:00:00.000Z'))).toBe('2026-10-12T18:00');
  });
  it('an empty or broken value is null', () => {
    expect(brtInputToIso('')).toBeNull();
    expect(brtInputToIso('amanhã')).toBeNull();
  });
});

describe('one key per print attempt (review 2026-10-09)', () => {
  it('keeps the key only when the answer was lost; any answer starts a new attempt', () => {
    let n = 0;
    const k = new TapKey(() => `k${++n}`);
    const first = k.get();
    expect(k.get()).toBe(first); // a second tap while unanswered: same request
    k.lost();
    expect(k.get()).toBe(first); // answer lost: the retry must be the same request
    k.answered();
    expect(k.get()).not.toBe(first); // a refusal or a success: the next tap is a new request
    const second = k.get();
    k.reset();
    expect(k.get()).not.toBe(second); // another item, storage or date: a new request
  });
});
