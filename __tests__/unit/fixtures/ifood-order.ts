/** iFood orders in the shape of GET /order/v1.0/orders/{id} (plan 2026-10-24 ifood, Task 3) */
export const ownDelivery = (): any => ({
  id: 'f2b7c0de-1111-4a4a-9b9b-000000000001',
  displayId: '4821',
  orderType: 'DELIVERY',
  orderTiming: 'IMMEDIATE',
  salesChannel: 'IFOOD',
  createdAt: '2026-10-24T22:10:00.000Z',
  merchant: { id: 'm1', name: 'Teste' },
  customer: { id: 'cust-1', name: 'Paula Souza', documentNumber: null, phone: { number: '0800 705 0500', localizer: '12345678', localizerExpiration: '2026-10-25T02:10:00Z' } },
  items: [
    {
      index: 1, id: 'i1', externalCode: 'ESP-FRANGO', name: 'Espeto de frango', quantity: 2, unitPrice: 10, optionsPrice: 2, price: 20, totalPrice: 24,
      observations: 'bem passado', options: [{ name: 'Farofa', externalCode: 'FAR', quantity: 1, unitPrice: 1, price: 1 }],
    },
    { index: 2, id: 'i2', externalCode: '', name: 'Refrigerante lata', quantity: 1, unitPrice: 6, optionsPrice: 0, price: 6, totalPrice: 6, options: [] },
  ],
  benefits: [{ value: 8, target: 'CART', sponsorshipValues: [{ name: 'IFOOD', value: 5 }, { name: 'MERCHANT', value: 3 }] }],
  total: { subTotal: 30, deliveryFee: 7, benefits: 8, orderAmount: 29, additionalFees: 0 },
  payments: { prepaid: 29, pending: 0, methods: [{ value: 29, currency: 'BRL', method: 'CREDIT', type: 'ONLINE', card: { brand: 'VISA' } }] },
  delivery: {
    mode: 'DEFAULT', deliveredBy: 'MERCHANT', deliveryDateTime: '2026-10-24T22:50:00Z', observations: 'portão azul',
    deliveryAddress: {
      streetName: 'Rua das Flores', streetNumber: '120', formattedAddress: 'Rua das Flores, 120', neighborhood: 'Centro', complement: 'ap 3',
      postalCode: '13201000', city: 'Jundiaí', state: 'SP', reference: 'perto da praça',
    },
  },
});

export const ifoodDelivery = (): any => {
  const o = ownDelivery();
  o.delivery.deliveredBy = 'IFOOD';
  o.benefits = [];
  o.total = { subTotal: 30, deliveryFee: 7, benefits: 0, orderAmount: 37, additionalFees: 0 };
  return o;
};

export const takeoutCash = (): any => {
  const o = ownDelivery();
  o.orderType = 'TAKEOUT';
  delete o.delivery;
  o.takeout = { mode: 'DEFAULT', takeoutDateTime: '2026-10-24T22:40:00Z' };
  o.pickupCode = '1234';
  o.benefits = [];
  o.total = { subTotal: 30, deliveryFee: 0, benefits: 0, orderAmount: 30, additionalFees: 0 };
  o.payments = { prepaid: 0, pending: 30, methods: [{ value: 30, currency: 'BRL', method: 'CASH', type: 'OFFLINE', cash: { changeFor: 100 } }] };
  return o;
};

export const scheduled = (): any => {
  const o = ifoodDelivery();
  o.orderTiming = 'SCHEDULED';
  o.schedule = { deliveryDateTimeStart: '2026-10-25T15:00:00Z', deliveryDateTimeEnd: '2026-10-25T15:30:00Z' };
  return o;
};

export const withCpf = (): any => {
  const o = ifoodDelivery();
  o.customer.documentNumber = '12345678909';
  o.payments = { prepaid: 0, pending: 37, methods: [{ value: 37, currency: 'BRL', method: 'DEBIT', type: 'OFFLINE', card: { brand: 'MASTERCARD' } }] };
  return o;
};
