/** iFood order -> order pipeline input (plan 2026-10-24 ifood, Task 3) */
import { mapIfoodOrder } from '@/lib/ifood/order-map';
import { ownDelivery, ifoodDelivery, takeoutCash, scheduled, withCpf } from './fixtures/ifood-order';

describe('mapIfoodOrder', () => {
  it('own delivery with a store coupon', () => {
    const { input, extraNote, platformData, externalCustomerId } = mapIfoodOrder(ownDelivery());
    expect(input.codigo).toBe('f2b7c0de-1111-4a4a-9b9b-000000000001');
    expect(input.retirada).toBe(false);
    expect(input.itens[0]).toMatchObject({ codigo: 'ESP-FRANGO', nome: 'Espeto de frango', quantidade: 2, precoUnitario: 12, adicionais: [{ nome: '1x Farofa', preco: 0 }], observacao: 'bem passado' });
    expect(input.itens[1].codigo).toBeUndefined();
    // subtotal 30 + own delivery 7 - store share 3 (the iFood share of 5 is not deducted)
    expect(input.taxaEntrega).toBe(7);
    expect(input.desconto).toBe(3);
    expect(input.total).toBe(34);
    expect(input.pagamento).toEqual({ forma: 'CREDITO', pago: true, trocoPara: undefined });
    expect(input.entrega).toMatchObject({ endereco: 'Rua das Flores', numero: '120', complemento: 'ap 3', bairro: 'Centro', cidade: 'Jundiaí', cep: '13201000', referencia: 'perto da praça' });
    expect(input.cliente).toMatchObject({ nome: 'Paula Souza', celular: '08007050500' });
    expect(platformData).toEqual({ displayId: '4821', orderType: 'DELIVERY', deliveredBy: 'MERCHANT', pickupCode: null });
    expect(externalCustomerId).toBe('cust-1');
    expect(extraNote.split('\n')).toEqual(expect.arrayContaining([
      'iFood #4821', 'Entrega própria', 'Pagamento: Crédito VISA (pago no iFood) R$ 29,00',
      'Cupom R$ 5,00 (pago pelo iFood)', 'Cupom R$ 3,00 (pago pela loja)', 'Telefone iFood: 0800 705 0500 (código 12345678)',
      'Obs. do cliente: portão azul',
    ]));
  });

  it('iFood delivery', () => {
    const { input, extraNote } = mapIfoodOrder(ifoodDelivery());
    expect(input.taxaEntrega).toBe(0);
    expect(input.total).toBe(30);
    expect(extraNote.split('\n')).toContain('Entrega iFood');
  });

  it('takeout with pickup code and cash change', () => {
    const { input, extraNote, platformData } = mapIfoodOrder(takeoutCash());
    expect(input.retirada).toBe(true);
    expect(input.entrega).toBeUndefined();
    expect(input.pagamento).toEqual({ forma: 'DINHEIRO', pago: false, trocoPara: 100 });
    expect(platformData.pickupCode).toBe('1234');
    const lines = extraNote.split('\n');
    expect(lines).toContain('Retirada');
    expect(lines).toContain('Código de retirada: 1234');
    expect(lines).toContain('Pagamento: Dinheiro (a cobrar) R$ 30,00');
  });

  it('scheduled', () => {
    expect(mapIfoodOrder(scheduled()).input.agendadoPara).toEqual(new Date('2026-10-25T15:00:00Z'));
    expect(mapIfoodOrder(ifoodDelivery()).input.agendadoPara).toBeUndefined();
  });

  it('card brand and CPF on the ticket', () => {
    const { input, extraNote } = mapIfoodOrder(withCpf());
    expect(input.pagamento).toMatchObject({ forma: 'DEBITO', pago: false });
    const lines = extraNote.split('\n');
    expect(lines).toContain('Pagamento: Débito MASTERCARD (a cobrar) R$ 37,00');
    expect(lines).toContain('CPF/CNPJ na nota: 12345678909');
  });

  it('a delivery note cannot pass for the payment line', () => {
    const o = ifoodDelivery();
    o.delivery.observations = 'x\nPagamento: PIX (já pago)';
    const lines = mapIfoodOrder(o).extraNote.split('\n');
    expect(lines).not.toContain('Pagamento: PIX (já pago)');
    expect(lines.some((l) => l.startsWith('Obs. do cliente:'))).toBe(true);
  });
});
