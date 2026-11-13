import { mapNinetynineOrder } from '@/lib/ninetynine/order-map';

const storeDelivery = {
  order_id: '5764625173055605123', order_index: 2, status: 100, delivery_type: 2, fulfillment_mode: 0,
  pay_type: 2, pay_method: 2, pay_channel: 153, change_for: 5000000, need_cutlery: true, remark: 'Sem cebola',
  price: { order_price: 5720000, items_discount: 2540000, delivery_discount: 0, delivery_price: 700, store_charged_delivery_price: 700, real_price: 4680700, customer_need_paying_money: 4680700, others_fees: { coupon_discount: 1040000 } },
  promotions: [{ promo_type: 2, promo_discount: 1040000, shop_subside_price: 1040000 }, { promo_type: 11, promo_discount: 1500000, shop_subside_price: 0 }],
  receive_address: {
    name: 'Maria Souza', first_name: 'Maria', last_name: 'Souza', calling_code: '55', phone: '11988887777',
    street_name: 'Rua das Flores', street_number: '10', complement: 'Ap 3', district: 'Centro', city: 'Sinop', state: 'MT', postal_code: '78550000',
  },
  order_items: [
    { name: 'Pizza', amount: 2, sku_price: 2800000, total_price: 5720000, app_item_id: 'PZ1', remark: 'bem passada',
      sub_item_list: [{ name: 'Borda', amount: 1, total_price: 60000, sub_item_list: [{ name: 'Catupiry', amount: 2, total_price: 0 }] }] },
  ],
};

const platformDelivery = {
  order_id: '5764625173055605456', order_index: 7, delivery_type: 1, fulfillment_mode: 0,
  pay_type: 1, pay_method: 1, pay_channel: 212,
  price: { order_price: 6000, delivery_price: 900, shop_paid_money: 1500, others_fees: {} },
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
    expect(input.desconto).toBe(10400);
    expect(input.total).toBe(46807);
    expect(input.itens[0]).toMatchObject({ codigo: 'PZ1', nome: 'Pizza', quantidade: 2, precoUnitario: 28600, observacao: 'bem passada' });
    expect(input.itens[0].adicionais).toEqual([{ nome: '1x Borda', preco: 0 }, { nome: '1x Borda > 2x Catupiry', preco: 0 }]);
    expect(input.entrega).toMatchObject({ endereco: 'Rua das Flores', numero: '10', complemento: 'Ap 3', bairro: 'Centro', cidade: 'Sinop', cep: '78550000' });
    expect(input.cliente).toMatchObject({ nome: 'Maria', celular: '11988887777' });
    expect(input.pagamento).toEqual({ forma: 'DINHEIRO', pago: false });
    expect(extraNote).toContain('99Food #2');
    expect(extraNote).toContain('5764625173055605123');
    expect(extraNote).toContain('Entrega própria');
    expect(extraNote).toContain('Cobrar R$ 46.807,00 do cliente');
    expect(extraNote).toContain('Troco para R$ 50.000,00 (levar R$ 3.193,00)');
    expect(extraNote.match(/Troco/g)).toHaveLength(1);
    expect(extraNote).toContain('Talheres: sim');
    expect(extraNote).toContain('Sem cebola');
    expect(platformData).toMatchObject({ orderIndex: 2, orderId: '5764625173055605123', deliveryType: 2, cashToCollect: 46807, shopPaidMoney: null });
  });

  it('maps a 99Food-delivery masked order with promotions', () => {
    const { input, extraNote, platformData } = mapNinetynineOrder(platformDelivery);
    expect(input.taxaEntrega).toBe(0);
    expect(input.desconto).toBe(4);
    expect(input.total).toBe(56);
    expect(input.itens.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0) + input.taxaEntrega - input.desconto).toBe(56);
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
    expect(input.pagamento).toEqual({ forma: 'DINHEIRO', pago: false });
    expect(extraNote).not.toContain('Cobrar');
    expect(extraNote).not.toContain('Troco');
  });

  it('tells the kitchen to wait for the amount when the courier is not assigned yet', () => {
    const o = { ...platformDelivery, pay_type: 2, pay_method: 2, pay_channel: 153, price: { order_price: 6000 } };
    const { extraNote, platformData } = mapNinetynineOrder(o);
    expect(platformData.shopPaidMoney).toBeNull();
    expect(extraNote).toContain('Dinheiro: a 99Food informa o valor quando o entregador for designado');
  });

  it('keeps a 99Food-subsidised promotion from lowering the sale', () => {
    const o = { ...platformDelivery, promotions: [{ promo_discount: 2000, shop_subside_price: 0 }] };
    const { input } = mapNinetynineOrder(o);
    expect(input.desconto).toBe(0);
    expect(input.total).toBe(60);
  });

  it('handles change_for smaller than what the customer pays', () => {
    const { extraNote } = mapNinetynineOrder({ ...storeDelivery, change_for: 1000 });
    expect(extraNote).toContain('Cliente informou troco para R$ 10,00');
    expect(extraNote).not.toContain('levar');
  });

  it('honours weight_unit and leaves cashToCollect null without an amount', () => {
    const kg = { ...platformDelivery, order_items: [{ name: 'Queijo', amount: 1, total_price: 3000, sales_type: 'weight', weight: 0.5, weight_unit: 'kg' }] };
    expect(mapNinetynineOrder(kg).input.itens[0].nome).toBe('Queijo (0,5 kg)');
    const o = { ...storeDelivery, price: { order_price: 5720000, delivery_price: 700 } };
    expect(mapNinetynineOrder(o).platformData.cashToCollect).toBeNull();
  });

  it('maps online credit/debit card (150) as CREDITO paid', () => {
    const { input, extraNote } = mapNinetynineOrder({ ...platformDelivery, pay_channel: 150 });
    expect(input.pagamento).toEqual({ forma: 'CREDITO', pago: true });
    expect(extraNote).toContain('Cartão (crédito/débito)');
  });

  it('maps a self-pickup order without delivery fee or address', () => {
    const { input, extraNote, platformData } = mapNinetynineOrder(pickup);
    expect(input.retirada).toBe(true);
    expect(input.entrega).toBeUndefined();
    expect(input.taxaEntrega).toBe(0);
    expect(input.total).toBe(30);
    expect(input.desconto).toBe(0);
    expect(input.cliente.celular).toBe('00011112222');
    expect(extraNote).toContain('Retirada');
    expect(extraNote).toContain('Código de retirada 1234');
    expect(extraNote).toContain('99Food #12');
    expect(platformData.takeawayCode).toBe('1234');
    expect(platformData.fulfillmentMode).toBe(1);
  });

  it('collects cash at the counter on a self-pickup order', () => {
    const o = { ...pickup, pay_type: 2, pay_method: 2, pay_channel: 153, change_for: 5000, price: { order_price: 3000, customer_need_paying_money: 3000 } };
    const { input, extraNote, platformData } = mapNinetynineOrder(o);
    expect(input.pagamento).toEqual({ forma: 'DINHEIRO', pago: false });
    expect(platformData.cashToCollect).toBe(30);
    expect(extraNote).toContain('Cobrar R$ 30,00 do cliente');
    expect(extraNote).toContain('Troco para R$ 50,00 (levar R$ 20,00)');
  });

  it('keeps the delivery fee in the sale when real_price is absent', () => {
    const { real_price, ...price } = storeDelivery.price;
    const { input } = mapNinetynineOrder({ ...storeDelivery, price });
    expect(input.taxaEntrega).toBe(7);
    expect(input.desconto).toBe(10400);
    expect(input.total).toBe(46807);
  });

  it('never charges a fee on a pickup order even if delivery_type says store delivery', () => {
    const { input } = mapNinetynineOrder({ ...storeDelivery, fulfillment_mode: 1, price: { ...storeDelivery.price, real_price: 4680000 } });
    expect(input.retirada).toBe(true);
    expect(input.taxaEntrega).toBe(0);
    expect(input.total).toBe(46800);
  });

  it('never returns a negative total', () => {
    const o = { ...platformDelivery, promotions: [{ shop_subside_price: 99999 }] };
    expect(mapNinetynineOrder(o).input.total).toBe(0);
  });
});

describe('priceSummary', () => {
  it('keeps the price numbers and payment codes, nothing personal', () => {
    const { priceSummary } = require('@/lib/ninetynine/order-map');
    const s = priceSummary({ ...storeDelivery, price: { ...storeDelivery.price, note: 'Maria 11988887777 x' } });
    const parsed = JSON.parse(s);
    expect(parsed.price.real_price).toBe(4680700);
    expect(parsed.price.customer_need_paying_money).toBe(4680700);
    expect(parsed.price.others_fees).toEqual({ coupon_discount: 1040000 });
    expect(parsed.pay_type).toBe(2);
    expect(parsed.delivery_type).toBe(2);
    expect(parsed.price.note).toBeUndefined();
    expect(s).not.toContain('Maria');
    expect(s).not.toContain('Flores');
  });
});

describe('99Food service fee (homolog 2026-11-13)', () => {
  const sandbox = (price: object) => ({
    order_id: '5764700448078496530', order_index: 1, status: 100, delivery_type: 2, fulfillment_mode: 0,
    pay_type: 2, pay_method: 2, pay_channel: 153, price,
    receive_address: { first_name: 'Lucas', phone: '0623442164', street_name: 'Avenida T-2', street_number: '1918' },
    order_items: [
      { name: 'Pizza Margherita Especial', amount: 1, total_price: 6200 },
      { name: 'Pizza Calabresa', amount: 1, total_price: 6400 },
      { name: 'Pizza Atum', amount: 1, total_price: 5900 },
    ],
  });
  const withCoupon = sandbox({
    order_price: 18500, delivery_price: 100, store_charged_delivery_price: 100, items_discount: 900, delivery_discount: 0,
    others_fees: { service_price: 699, coupon_discount: 900, total_tip_money: 0, small_order_price: 0 },
    real_price: 18399, real_pay_price: 18399, customer_need_paying_money: 18399, commission_price: 0, refund_price: 0,
  });
  const noCoupon = sandbox({
    order_price: 18500, delivery_price: 100, store_charged_delivery_price: 100, items_discount: 0, delivery_discount: 0,
    others_fees: { service_price: 699, coupon_discount: 0, total_tip_money: 0, small_order_price: 0 },
    real_price: 19299, real_pay_price: 19299, customer_need_paying_money: 19299,
  });

  it('cash on store delivery: the total is what the delivery person collects, with the fee and the real coupon', () => {
    const m = mapNinetynineOrder(noCoupon);
    expect(m.input.total).toBe(192.99);
    expect(m.input.taxaServico).toBe(6.99);
    expect(m.input.desconto).toBe(0);
    expect(m.extraNote).toContain('Cobrar R$ 192,99 do cliente');
    expect(m.extraNote).toContain('Taxa de serviço da 99Food: R$ 6,99 (já no total)');

    const c = mapNinetynineOrder(withCoupon);
    expect(c.input.total).toBe(183.99);
    expect(c.input.desconto).toBe(9);
    expect(c.input.taxaServico).toBe(6.99);
    expect(c.input.taxaEntrega).toBe(1);
  });

  it('paid in the 99Food app: the fee is 99Food\'s and stays out of the sale', () => {
    const m = mapNinetynineOrder({ ...withCoupon, pay_type: 1, pay_method: 1, pay_channel: 212 });
    expect(m.input.taxaServico).toBeUndefined();
    expect(m.input.desconto).toBe(9);
    expect(m.input.total).toBe(177);
    expect(m.extraNote).not.toContain('Taxa de serviço');
  });
});
