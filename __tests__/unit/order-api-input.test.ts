import { parseOrderApiInput } from '@/lib/delivery-orders/input';
import { EXAMPLE_ORDER } from '@/lib/delivery-orders/example';

// The Gastrux order API body (plan 2026-10-23 api-de-pedidos, Task 3)
const base = () => JSON.parse(JSON.stringify(EXAMPLE_ORDER));
const errorOf = (body: unknown) => { const r = parseOrderApiInput(body); return r.ok ? null : r.error; };

describe('parseOrderApiInput', () => {
  it('the example of /desenvolvedores is accepted as it is', () => {
    const r = parseOrderApiInput(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ codigo: 'PED-1042', retirada: false, taxaEntrega: 7, desconto: 0, total: 45 });
    expect(r.value.cliente.celular).toBe('11988887777');
    expect(r.value.itens[0]).toMatchObject({ codigo: 'ESP-ALC', quantidade: 2, precoUnitario: 14, adicionais: [{ nome: 'Farofa extra', preco: 2 }] });
  });

  it('names the field that is wrong', () => {
    const cases: Array<[(b: any) => void, string]> = [
      [(b) => { delete b.codigo; }, 'codigo'],
      [(b) => { b.itens = []; }, 'itens'],
      [(b) => { b.itens[1].quantidade = 0; }, 'itens[2].quantidade'],
      [(b) => { b.itens[1].quantidade = 100; }, 'itens[2].quantidade'],
      [(b) => { b.itens[1].quantidade = 1.5; }, 'itens[2].quantidade'],
      [(b) => { b.itens[0].precoUnitario = -1; }, 'itens[1].precoUnitario'],
      [(b) => { b.itens[0].nome = '  '; }, 'itens[1].nome'],
      [(b) => { b.cliente.celular = 'sem número'; }, 'cliente.celular'],
      [(b) => { b.cliente.nome = ''; }, 'cliente.nome'],
      [(b) => { delete b.entrega; }, 'entrega.endereco'],
      [(b) => { b.pagamento.forma = 'BOLETO'; }, 'pagamento.forma'],
      [(b) => { b.taxaEntrega = -2; }, 'taxaEntrega'],
    ];
    for (const [change, field] of cases) {
      const b = base(); change(b);
      expect([field, errorOf(b)?.startsWith(`${field}:`)]).toEqual([field, true]);
    }
    expect(errorOf(null)).toMatch(/^pedido:/);
  });

  it('a pickup order needs no address', () => {
    const b = base(); delete b.entrega; b.retirada = true; b.taxaEntrega = 0; b.total = 38;
    expect(parseOrderApiInput(b).ok).toBe(true);
  });

  it('the total must match the items, add-ons, delivery fee and discount', () => {
    const b = base(); b.total = 50;
    expect(errorOf(b)).toBe('total: não confere com os itens (esperado R$ 45,00)');
    const d = base(); d.desconto = 5; d.total = 40;
    expect(parseOrderApiInput(d).ok).toBe(true);
    const c = base(); c.total = 45.009; // within one cent
    expect(parseOrderApiInput(c).ok).toBe(true);
  });

  it('a scheduled time must be a date in the future', () => {
    const b = base(); b.agendadoPara = 'amanhã às 20h';
    expect(errorOf(b)).toMatch(/^agendadoPara:/);
    const p = base(); p.agendadoPara = new Date(Date.now() - 3600e3).toISOString();
    expect(errorOf(p)).toMatch(/^agendadoPara:/);
    const f = base(); f.agendadoPara = new Date(Date.now() + 3600e3).toISOString();
    const r = parseOrderApiInput(f);
    expect(r.ok && r.value.agendadoPara instanceof Date).toBe(true);
  });

  it('long texts are cut and line breaks become " / "', () => {
    const b = base(); b.cliente.nome = 'M'.repeat(300); b.observacao = 'linha 1\nlinha 2\r\nlinha 3' + 'x'.repeat(600);
    const r = parseOrderApiInput(b);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cliente.nome.length).toBe(120);
    expect(r.value.observacao!.startsWith('linha 1 / linha 2 / linha 3')).toBe(true);
    expect(r.value.observacao!.length).toBe(500);
  });
});
