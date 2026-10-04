// @ts-nocheck
/**
 * What Gastrux sends to Focus NFe for an NFC-e (lib/nfe/focus-nfe-client.ts).
 * The emission time used to be the UTC clock labelled -03:00: every real note would have been
 * 3 hours in the future and refused by SEFAZ (rejeição 703).
 */
import { FocusNFeClient, brasiliaDateTime } from '../../lib/nfe/focus-nfe-client';

describe('Focus NFe NFC-e payload', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('writes Brasília local time with its -03:00 offset', () => {
    expect(brasiliaDateTime(new Date('2026-10-04T22:55:30.123Z'))).toBe('2026-10-04T19:55:30-03:00');
    // Just after midnight UTC is still the previous day in Brasília
    expect(brasiliaDateTime(new Date('2026-10-05T01:10:00Z'))).toBe('2026-10-04T22:10:00-03:00');
  });

  it('the emission time sent is the current instant, never in the future', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-05T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ status: 'autorizado', chave_nfe: 'NFe35' }) });

    await new FocusNFeClient('key', 'sandbox').emitNFCe({
      providerRef: 'ref-1', documentType: 'NFCe', cnpj: '60.957.269/0001-92', uf: 'SP', series: 1, number: 1,
      environment: 'sandbox', items: [{ description: 'Bolo', quantity: 2, unit: 'UN', unitPrice: 12.5, totalPrice: 25, ncm: '19059090', cfop: '5102', icmsOrigin: '0', icmsCST: '102' }],
      totalAmount: 25, paymentMethod: 'pix', paymentAmount: 25,
    });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://homologacao.focusnfe.com.br/v2/nfce?ref=ref-1');
    const sent = JSON.parse(init.body);
    expect(sent.data_emissao).toBe('2026-10-05T09:00:00-03:00');
    expect(new Date(sent.data_emissao).getTime()).toBe(Date.parse('2026-10-05T12:00:00Z'));
    expect(sent).toMatchObject({ cnpj_emitente: '60957269000192', uf_emitente: 'SP', formas_pagamento: [{ forma_pagamento: '17', valor_pagamento: '25.00' }] });
    expect(sent.items[0]).toMatchObject({ ncm: '19059090', cfop: '5102', origem: '0', icms_situacao_tributaria: '102', valor_bruto: '25.00' });
  });
});
