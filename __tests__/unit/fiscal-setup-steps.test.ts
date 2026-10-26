import { FISCAL_STEPS, fiscalSetupProgress, accountantMessage } from '../../lib/nfe/setup-steps';

const full = {
  cnpj: '60957269000192', stateRegistration: '123456789', companyName: 'TAJ LTDA', uf: 'SP', crt: '1',
  nfeApiKey: '••••••ab12', environment: 'sandbox',
  defaultNcm: '21069090', defaultCfop: '5102', defaultOrigin: '0', defaultCsosn: '102', pisCofinsCst: '49',
};

describe('fiscal setup steps (configuração fiscal guiada)', () => {
  it('five steps, in order', () => {
    expect(FISCAL_STEPS.map((s) => s.title)).toEqual(['O que ter em mãos', 'Empresa', 'Emissor (Focus NFe)', 'Tributação (contador)', 'Revisar e testar']);
  });

  it('nothing configured: starts at the checklist', () => {
    const p = fiscalSetupProgress(null);
    expect(p.done).toEqual({ empresa: false, emissor: false, tributacao: false });
    expect(p.resumeAt).toBe(0);
    expect(p.ready).toBe(false);
  });

  it('a full configuration is ready and opens at the review', () => {
    const p = fiscalSetupProgress(full);
    expect(p.done).toEqual({ empresa: true, emissor: true, tributacao: true });
    expect(p.ready).toBe(true);
    expect(p.resumeAt).toBe(4);
  });

  it('resumes at the first step missing something, and says what', () => {
    expect(fiscalSetupProgress({ ...full, stateRegistration: '' }).resumeAt).toBe(1);
    expect(fiscalSetupProgress({ ...full, stateRegistration: '' }).missing.empresa).toContain('Inscrição Estadual');
    expect(fiscalSetupProgress({ ...full, nfeApiKey: '' }).resumeAt).toBe(2);
    const t = fiscalSetupProgress({ ...full, defaultNcm: '', pisCofinsCst: null });
    expect(t.resumeAt).toBe(3);
    expect(t.missing.tributacao).toEqual(['NCM', 'CST de PIS/COFINS']);
  });

  it('the Regime Normal (CRT 3) is not supported: the company step is not done', () => {
    const p = fiscalSetupProgress({ ...full, crt: '3' });
    expect(p.done.empresa).toBe(false);
    expect(p.missing.empresa).toContain('Regime: hoje só Simples Nacional');
  });

  it('a CNPJ needs 14 digits', () => {
    expect(fiscalSetupProgress({ ...full, cnpj: '12.345' }).missing.empresa).toContain('CNPJ');
    expect(fiscalSetupProgress({ ...full, cnpj: '60.957.269/0001-92' }).done.empresa).toBe(true);
  });

  it('the message for the accountant names the company and the five fields', () => {
    const m = accountantMessage({ companyName: 'TAJ LTDA', cnpj: '60957269000192', uf: 'SP' });
    expect(m).toContain('TAJ LTDA');
    expect(m).toContain('60.957.269/0001-92');
    for (const f of ['NCM', 'CFOP', 'Origem', 'CSOSN', 'PIS/COFINS']) expect(m).toContain(f);
  });
});
