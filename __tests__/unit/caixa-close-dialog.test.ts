import { buildCountedPayload } from '../../components/caixa/counted';

describe('buildCountedPayload', () => {
  it('empty fields count as zero; values are normalized to "0.00"', () => {
    expect(buildCountedPayload({ dinheiro: '1.234,50', pix: '', credito: '10', debito: '0', outros: '' })).toEqual({
      counted: { dinheiro: '1234.50', pix: '0.00', credito: '10.00', debito: '0.00', outros: '0.00' },
      invalid: [],
    });
  });
  it('flags invalid fields by label', () => {
    expect(buildCountedPayload({ dinheiro: 'abc', pix: '', credito: '', debito: '', outros: '' }).invalid).toEqual(['Dinheiro']);
  });
});
