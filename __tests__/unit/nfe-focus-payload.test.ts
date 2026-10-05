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
    expect(sent.items[0]).toMatchObject({ codigo_ncm: '19059090', cfop: '5102', icms_origem: '0', icms_situacao_tributaria: '102', valor_bruto: '25.00' });
  });

  /**
   * First real note in SEFAZ homologation (2026-10-05) was refused by Focus with "Erro na validação do
   * Schema XML": NCM and origin went as `ncm`/`origem`, names Focus does not read (it reads
   * `codigo_ncm`/`icms_origem`), so the note had no NCM.
   */
  it('uses the field names Focus reads and the NFC-e header fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ status: 'processando_autorizacao' }) });
    await new FocusNFeClient('key', 'production').emitNFCe({
      providerRef: 'ref-2', documentType: 'NFCe', cnpj: '60957269000192', uf: 'SP', series: 1, number: 2,
      environment: 'production', items: [{ description: 'Bolo', quantity: 1, unit: 'UN', unitPrice: 1, totalPrice: 1, ncm: '19059090', icmsOrigin: '0', icmsCST: '102' }],
      totalAmount: 1, paymentMethod: 'dinheiro', paymentAmount: 1,
    });
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({ modalidade_frete: '9', consumidor_final: '1', presenca_comprador: '1' });
    expect(sent).not.toHaveProperty('municipio_emitente');
    expect(sent.items[0]).not.toHaveProperty('ncm');
    expect(sent.items[0]).not.toHaveProperty('origem');
    expect(sent.items[0].descricao).toBe('Bolo');
  });

  it('in homologation the first item carries the description SEFAZ requires (rejeição 373)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ status: 'processando_autorizacao' }) });
    await new FocusNFeClient('key', 'sandbox').emitNFCe({
      providerRef: 'ref-3', documentType: 'NFCe', cnpj: '60957269000192', uf: 'SP', series: 1, number: 3,
      environment: 'sandbox', items: [{ description: 'Bolo', quantity: 1, unit: 'UN', unitPrice: 1, totalPrice: 1 }, { description: 'Café', quantity: 1, unit: 'UN', unitPrice: 1, totalPrice: 1 }],
      totalAmount: 2, paymentMethod: 'dinheiro', paymentAmount: 2,
    });
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.items[0].descricao).toBe('NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL');
    expect(sent.items[1].descricao).toBe('Café');
  });

  it('a schema refusal shows every error Focus listed, not only the generic message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 422,
      json: async () => ({ codigo: 'erro_validacao_schema', mensagem: 'Erro na validação do Schema XML, verifique o detalhamento dos erros', erros: [{ codigo: 'erro_validacao_schema', mensagem: "Element 'NCM': [facet 'pattern'] invalid" }] }),
    });
    const r = await new FocusNFeClient('key', 'sandbox').emitNFCe({
      providerRef: 'ref-4', documentType: 'NFCe', cnpj: '60957269000192', uf: 'SP', series: 1, number: 4,
      environment: 'sandbox', items: [{ description: 'Bolo', quantity: 1, unit: 'UN', unitPrice: 1, totalPrice: 1 }],
      totalAmount: 1, paymentMethod: 'dinheiro', paymentAmount: 1,
    });
    expect(r.status).toBe('rejected');
    expect(r.rejectionReason).toContain('Erro na validação do Schema XML');
    expect(r.rejectionReason).toContain("Element 'NCM'");
  });
});
