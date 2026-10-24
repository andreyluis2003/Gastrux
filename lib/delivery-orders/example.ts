/**
 * The order shown on /desenvolvedores and used by the tests (plan 2026-10-23 api-de-pedidos): what the docs show is
 * what the API accepts.
 */
export const EXAMPLE_ORDER = {
  codigo: 'PED-1042',
  cliente: { nome: 'Maria Souza', celular: '(11) 98888-7777', email: 'maria@exemplo.com' },
  retirada: false,
  entrega: { endereco: 'Rua das Flores', numero: '120', complemento: 'apto 32', bairro: 'Centro', cidade: 'São Paulo', cep: '01010-000', referencia: 'perto da padaria' },
  itens: [
    { codigo: 'ESP-ALC', nome: 'Espeto de alcatra', quantidade: 2, precoUnitario: 14, adicionais: [{ nome: 'Farofa extra', preco: 2 }], observacao: 'bem passado' },
    { nome: 'Refrigerante lata', quantidade: 1, precoUnitario: 6 },
  ],
  taxaEntrega: 7,
  desconto: 0,
  total: 45,
  pagamento: { forma: 'DINHEIRO', pago: false, trocoPara: 50 },
  observacao: 'Tocar o interfone 32',
} as const;
