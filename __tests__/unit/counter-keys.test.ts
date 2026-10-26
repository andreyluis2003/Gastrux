import { counterKeyAction } from '../../lib/vender/counter-keys';
import { addRemaining } from '../../components/caixa/panel-state';

const k = (key: string, where: 'search' | 'field' | 'page' = 'page', mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
  counterKeyAction({ key, inSearch: where === 'search', inField: where !== 'page', ...mods });

describe('counter sale keyboard shortcuts (atalhos de teclado no balcão)', () => {
  it('F2 goes to the search from anywhere; "/" only outside a field', () => {
    expect(k('F2', 'page')).toBe('focusSearch');
    expect(k('F2', 'field')).toBe('focusSearch');
    expect(k('/', 'page')).toBe('focusSearch');
    expect(k('/', 'field')).toBeNull();
  });

  it('in the search: arrows move, Enter adds, Escape leaves', () => {
    expect(k('ArrowDown', 'search')).toBe('next');
    expect(k('ArrowUp', 'search')).toBe('prev');
    expect(k('Enter', 'search')).toBe('pick');
    expect(k('Escape', 'search')).toBe('leaveSearch');
    expect(k('ArrowDown', 'page')).toBeNull();
  });

  it('1 to 4 outside a field pay the rest in cash, PIX, credit, debit; typing in a field is never taken', () => {
    expect(k('1')).toBe('pay:dinheiro');
    expect(k('2')).toBe('pay:pix');
    expect(k('3')).toBe('pay:cartao de credito');
    expect(k('4')).toBe('pay:cartao de debito');
    expect(k('5')).toBeNull();
    expect(k('1', 'field')).toBeNull();
    expect(k('1', 'search')).toBeNull();
  });

  it('Ctrl+Enter finishes from anywhere; keys the browser uses (F5, Ctrl+1) are left alone', () => {
    expect(k('Enter', 'field', { ctrlKey: true })).toBe('finish');
    expect(k('Enter', 'page', { metaKey: true })).toBe('finish');
    expect(k('Enter', 'page')).toBeNull();
    expect(k('F5')).toBeNull();
    expect(k('1', 'page', { ctrlKey: true })).toBeNull();
    expect(k('1', 'page', { altKey: true })).toBeNull();
  });
});

describe('addRemaining (a payment method button or key)', () => {
  it('the first method takes the whole total, the next one what is missing, nothing when paid', () => {
    expect(addRemaining(2350, [], 'pix')).toEqual([{ method: 'pix', amount: '23,50' }]);
    expect(addRemaining(2350, [{ method: 'dinheiro', amount: '10,00' }], 'cartao de debito')).toEqual([
      { method: 'dinheiro', amount: '10,00' }, { method: 'cartao de debito', amount: '13,50' },
    ]);
    const paid = [{ method: 'dinheiro' as const, amount: '30,00' }];
    expect(addRemaining(2350, paid, 'pix')).toBe(paid);
  });
});
