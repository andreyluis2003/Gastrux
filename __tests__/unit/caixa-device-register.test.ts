import { pickRegister } from '../../lib/caixa/device-register';
import { reaisToCents } from '../../components/caixa/money';

const regs = [
  { id: 'a', name: 'Caixa principal', isDefault: true },
  { id: 'b', name: 'Caixa Balcão', isDefault: false },
];

describe('pickRegister', () => {
  it('keeps the remembered register when it is still listed', () => expect(pickRegister(regs, 'b')?.id).toBe('b'));
  it('falls back to the default when the remembered one was deactivated or is from another restaurant', () => expect(pickRegister(regs, 'zzz')?.id).toBe('a'));
  it('falls back to the first when there is no default', () => expect(pickRegister([regs[1]], null)?.id).toBe('b'));
  it('null when there are no registers', () => expect(pickRegister([], 'a')).toBeNull());
});

describe('reaisToCents', () => {
  it.each([['10', 1000], ['10,50', 1050], ['0,01', 1], ['1.234,56', 123456]])('%s', (t, c) => expect(reaisToCents(t)).toBe(c));
  it.each([['abc'], ['1,234'], ['-1'], ['']])('invalid %s', (t) => expect(reaisToCents(t)).toBeNull());
  // Opening float: a register may open with no change at all (typing 0 was refused, 2026-10-09)
  it.each([['0', 0], ['0,00', 0], ['50', 5000]])('zero allowed when asked: %s', (t, c) => expect(reaisToCents(t, { allowZero: true })).toBe(c));
  it('a payment still refuses zero', () => expect(reaisToCents('0')).toBeNull());
});
