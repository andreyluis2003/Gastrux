import { mapNinetynineOrder } from '@/lib/ninetynine/order-map';

const storeDelivery = {
  order_id: '5764625173055605123', order_index: 2, status: 100, delivery_type: 2, fulfillment_mode: 0,
  pay_type: 2, pay_method: 2, pay_channel: 153, change_for: 10000, need_cutlery: true, remark: 'Sem cebola',
  price: { order_price: 5000, items_discount: 0, delivery_discount: 0, delivery_price: 700, real_price: 5700, customer_need_paying_money: 5700, others_fees: {} },
  receive_address: {
    name: 'Maria Souza', first_name: 'Maria', last_name: 'Souza', calling_code: '55', phone: '11988887777',
    street_name: 'Rua das Flores', street_number: '10', complement: 'Ap 3', district: 'Centro', city: 'Sinop', state: 'MT', postal_code: '78550000',
  },
  order_items: [
    { name: 'Pizza', amount: 2, sku_price: 2000, total_price: 5000, app_item_id: 'PZ1', remark: 'bem passada',
      sub_item_list: [{ name: 'Borda', amount: 1, total_price: 500, sub_item_list: [{ name: 'Catupiry', amount: 2, total_price: 0 }] }] },
  ],
};

const platformDelivery = {
  order_id: '5764625173055605456', order_index: 7, delivery_type: 1, fulfillment_mode: 0,
  pay_type: 1, pay_method: 1, pay_channel: 212,
  price: { order_price: 6000, delivery_price: 900, real_price: 5000, shop_paid_money: 1500, others_fees: {} },
  promotions: [
    { promo_type: 1, promo_discount: 1000, shop_subside_price: 400 },
    { promo_type: 2, promo_discount: 500, shop_subside_price: 0 },
  ],
  receive_address: {
    name: 'privacy protection', first_name: 'privacy protection', phone: '317***5359', street_name: 'privacy protection',
    street_number: 'privacy protection', district: 'privacy protection', city: 'privacy protection', virtual_phone_number: '00016004812', locator: '4321',
  },
  handover_code: '8899',
  order_items: [{ name: 'Açaí', amount: 1, sku_price: 6000, total_price: 6000, app_item_id: '', sales_type: 'weight', weight: 500, weight_unit: 'gram' }],
};

const pickup = {
  order_id: '5764625173055605789', order_index: 12, delivery_type: 0, fulfillment_mode: 1, pay_type: 1, pay_method: 1, pay_channel: 190,
  price: { order_price: 3000, delivery_price: 500, others_fees: {} },
  receive_address: { name: 'João Lima', first_name: 'João', calling_code: '55', virtual_phone_number: '00011112222', locator: '77' },
  takeaway_code: '1234',
  order_items: [{ name: 'Burger', amount: 1, sku_price: 3000, total_price: 3000 }],
};

describe('mapNinetynineOrder', () => {
  it('maps a store-delivery cash order', () => {
    const { input, extraNote, platformData } = mapNinetynineOrder(storeDelivery);
    expect(input.codigo).toBe('5764625173055605123');
    expect(input.retirada).toBe(false);
    expect(input.taxaEntrega).toBe(7);
    expect(input.desconto).toBe(0);
    expect(input.total).toBe(57);
    expect(input.itens[0]).toMatchObject({ codigo: 'PZ1', nome: 'Pizza', quantidade: 2, precoUnitario: 25, observacao: 'bem passada' });
    expect(input.itens[0].adicionais).toEqual([{ nome: '1x Borda', preco: 0 }, { nome: '1x Borda > 2x Catupiry', preco: 0 }]);
    expect(input.entrega).toMatchObject({ endereco: 'Rua das Flores', numero: '10', complemento: 'Ap 3', bairro: 'Centro', cidade: 'Sinop', cep: '78550000' });
    expect(input.cliente).toMatchObject({ nome: 'Maria', celular: '11988887777' });
    expect(input.pagamento).toEqual({ forma: 'DINHEIRO', pago: false, trocoPara: 100 });
    expect(extraNote).toContain('99Food #2');
    expect(extraNote).toContain('5764625173055605123');
    expect(extraNote).toContain('Entrega própria');
    expect(extraNote).toContain('Troco para');
    expect(extraNote).toContain('Talheres: sim');
    expect(extraNote).toContain('Sem cebola');
    expect(platformData).toMatchObject({ orderIndex: 2, orderId: '5764625173055605123', deliveryType: 2, cashToCollect: 57, shopPaidMoney: null });
  });

  it('maps a 99Food-delivery masked order with promotions', () => {
    const { input, extraNote, platformData } = mapNinetynineOrder(platformDelivery);
    expect(input.taxaEntrega).toBe(0);
    expect(input.desconto).toBe(4);
    expect(input.total).toBe(56);
    expect(input.pagamento).toEqual({ forma: 'PIX', pago: true });
    expect(input.entrega?.endereco).toBe('Endereço protegido pela 99Food');
    expect(input.entrega?.numero).toBeUndefined();
    expect(input.cliente.nome).toBe('Cliente 99Food');
    expect(input.cliente.celular).toBe('00016004812');
    expect(input.itens[0].nome).toBe('Açaí (500 g)');
    expect(input.itens[0].codigo).toBeUndefined();
    expect(extraNote).toContain('Entrega 99Food');
    expect(extraNote).toContain('Ligar para o cliente: 00016004812 ramal 4321');
    expect(extraNote).toContain('Código de entrega 8899');
    expect(extraNote).toMatch(/pago pela loja/);
    expect(extraNote).toMatch(/pago pela 99Food/);
    expect(platformData).toMatchObject({ orderIndex: 7, deliveryType: 1, handoverCode: '8899', cashToCollect: null });
  });

  it('shows the cash the courier pays the store when the customer pays cash on 99Food delivery', () => {
    const o = { ...platformDelivery, pay_type: 2, pay_method: 2, pay_channel: 153 };
    const { extraNote, platformData, input } = mapNinetynineOrder(o);
    expect(platformData.shopPaidMoney).toBe(15);
    expect(extraNote).toContain('Receber R$');
    expect(extraNote).toContain('do entregador');
    expect(input.pagamento.forma).toBe('DINHEIRO');
  });

  it('maps a self-pickup order without delivery fee or address', () => {
    const { input, extraNote, platformData } = mapNinetynineOrder(pickup);
    expect(input.retirada).toBe(true);
    expect(input.entrega).toBeUndefined();
    expect(input.taxaEntrega).toBe(0);
    expect(input.total).toBe(30);
    expect(input.cliente.celular).toBe('00011112222');
    expect(extraNote).toContain('Retirada');
    expect(extraNote).toContain('Código de retirada 1234');
    expect(extraNote).toContain('99Food #12');
    expect(platformData.takeawayCode).toBe('1234');
    expect(platformData.fulfillmentMode).toBe(1);
  });

  it('never returns a negative total', () => {
    const o = { ...platformDelivery, promotions: [{ shop_subside_price: 99999 }] };
    expect(mapNinetynineOrder(o).input.total).toBe(0);
  });
});
