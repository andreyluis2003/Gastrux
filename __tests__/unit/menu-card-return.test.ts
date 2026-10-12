import { readTableCardReturn } from '@/lib/menu/card-return';

describe('coming back to the table from the card checkout', () => {
  it('reads our payment id and Mercado Pago\'s id (digits only) from the URL', () => {
    expect(readTableCardReturn('?payment=cmabc&result=success&payment_id=1827405&collection_id=1827405'))
      .toEqual({ paymentId: 'cmabc', mpPaymentId: '1827405', failed: false });
  });
  it('a failure return is a failure; approval is never read from the URL', () => {
    expect(readTableCardReturn('?payment=cmabc&result=failure')).toEqual({ paymentId: 'cmabc', mpPaymentId: null, failed: true });
    expect(readTableCardReturn('?payment=cmabc&result=success&status=approved')).toMatchObject({ failed: false });
  });
  it('ignores what is not a return, and a Mercado Pago id that is not digits', () => {
    expect(readTableCardReturn('')).toBeNull();
    expect(readTableCardReturn('?payment_id=123')).toBeNull();
    expect(readTableCardReturn('?payment=cmabc&payment_id=12a')).toMatchObject({ mpPaymentId: null });
  });
});
