import { validateMenu, validateTables, validateStaff, parsePrice } from '../../lib/ai/drafts/validate';

describe('draft validation (spec 2026-10-17 ia-implantacao §4.5)', () => {
  it('parses Brazilian prices', () => {
    expect(parsePrice('32,90')).toBe(32.9);
    expect(parsePrice('R$ 1.234,50')).toBe(1234.5);
    expect(parsePrice(12)).toBe(12);
    for (const bad of ['abc', 0, -1, 100000, '', null]) expect(parsePrice(bad)).toBeNull();
  });
  it('menu: trims, drops empty categories, refuses bad rows naming them', () => {
    const ok = validateMenu({ categorias: [{ nome: ' Bebidas ', itens: [{ nome: 'Coca', descricao: '', preco: '6,00' }] }, { nome: 'Vazia', itens: [] }], incompleto: false });
    expect(ok).toEqual({ ok: true, value: { categorias: [{ nome: 'Bebidas', itens: [{ nome: 'Coca', descricao: '', preco: 6 }] }], incompleto: false } });
    const bad = validateMenu({ categorias: [{ nome: 'Bebidas', itens: [{ nome: 'Coca', descricao: '', preco: 'abc' }] }], incompleto: false });
    expect(bad).toEqual({ ok: false, error: 'Item 1 ("Coca"): preço inválido' });
    const many = { categorias: [{ nome: 'X', itens: Array.from({ length: 301 }, (_, i) => ({ nome: `i${i}`, descricao: '', preco: 1 })) }], incompleto: false };
    expect(validateMenu(many).ok).toBe(false);
    expect(validateMenu({ categorias: [{ nome: 'X', itens: [{ nome: 'a'.repeat(121), descricao: '', preco: 1 }] }], incompleto: false }).ok).toBe(false);
  });
  it('tables and staff limits', () => {
    expect(validateTables({ quantidade: 10, inicio: 1, area: 'Salão', lugares: 4 }).ok).toBe(true);
    for (const bad of [{ quantidade: 0, inicio: 1, area: 'Salão', lugares: 4 }, { quantidade: 201, inicio: 1, area: 'Salão', lugares: 4 }, { quantidade: 5, inicio: 9997, area: 'Salão', lugares: 4 }, { quantidade: 5, inicio: 1, area: '', lugares: 4 }, { quantidade: 5, inicio: 1, area: 'Salão', lugares: 51 }])
      expect(validateTables(bad).ok).toBe(false);
    expect(validateStaff({ pessoas: [{ nome: 'Ana', email: '', papel: 'CAIXA' }] }, { requireEmail: false }).ok).toBe(true);
    expect(validateStaff({ pessoas: [{ nome: 'Ana', email: '', papel: 'CAIXA' }] }, { requireEmail: true }).ok).toBe(false);
    expect(validateStaff({ pessoas: [{ nome: 'Ana', email: 'x@', papel: 'CAIXA' }] }, { requireEmail: true }).ok).toBe(false);
    expect(validateStaff({ pessoas: [{ nome: 'Ana', email: 'a@b.co', papel: 'DONO' }] }, { requireEmail: true }).ok).toBe(false);
  });
});
