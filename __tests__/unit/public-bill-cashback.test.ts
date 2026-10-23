import { toPublicBill } from '@/lib/comanda/public-bill';

// The table's bill (pay at the table, QR) shows the cashback the cashier applied: subtotal + service − cashback = total
it('the public bill carries the cashback used, never the customer', () => {
  const bill: any = {
    sessionId: 's1', status: 'OPEN', label: 'Mesa 5', items: [{ id: 'i1', name: 'Prato', quantity: 1, totalCents: 5000 }],
    percent: 10, applies: true, waived: false, subtotalCents: 5000, serviceCents: 500, totalCents: 3500, paidCents: 0, remainingCents: 3500,
    payments: [], preBillPrintedAt: null, customerName: null, cashbackUsedCents: 2000,
    customer: { id: 'c1', name: 'Maria', phone: '(11) 99999-0000', balanceCents: 100 },
  };
  const pub = toPublicBill(bill);
  expect(pub).toMatchObject({ subtotalCents: 5000, serviceCents: 500, cashbackCents: 2000, totalCents: 3500 });
  expect(JSON.stringify(pub)).not.toContain('Maria');
});
