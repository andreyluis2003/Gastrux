import { serviceRow } from '@/lib/comanda/bill';

// 2026-10-23 (prod test): a closed bill showed the service charge box unticked although the total carried it
describe('serviceRow', () => {
  const bill = { applies: true, percent: 10, waived: false, serviceCents: 2100 };

  it('an open bill offers the choice, ticked while the customer pays it', () => {
    expect(serviceRow(bill, false)).toEqual({ show: true, editable: true, charged: true });
    expect(serviceRow({ ...bill, waived: true, serviceCents: 0 }, false)).toEqual({ show: true, editable: true, charged: false });
  });

  it('a closed bill shows what it was closed with, as text, never a box', () => {
    expect(serviceRow(bill, true)).toEqual({ show: true, editable: false, charged: true });
    expect(serviceRow({ ...bill, waived: true, serviceCents: 0 }, true)).toEqual({ show: true, editable: false, charged: false });
    // Closed with the charge even if the flag changed afterwards: the amount written on the bill rules
    expect(serviceRow({ ...bill, waived: true }, true)).toEqual({ show: true, editable: false, charged: true });
  });

  it('no row where the charge never applies', () => {
    expect(serviceRow({ ...bill, applies: false, serviceCents: 0 }, false).show).toBe(false);
    expect(serviceRow({ ...bill, percent: 0, serviceCents: 0 }, true).show).toBe(false);
  });
});
