/**
 * The guided fiscal setup (configuração fiscal guiada, 2026-10-26): five steps, what each still misses and where to
 * resume. Pure, safe to import from the browser. Only Focus NFe is wired (lib/nfe/provider.ts); the A1 certificate and
 * the CSC live in the Focus company record, not here.
 */

export const FISCAL_STEPS = [
  { key: 'checklist', title: 'O que ter em mãos' },
  { key: 'empresa', title: 'Empresa' },
  { key: 'emissor', title: 'Emissor (Focus NFe)' },
  { key: 'tributacao', title: 'Tributação (contador)' },
  { key: 'revisar', title: 'Revisar e testar' },
] as const;

export interface FiscalSetupConfig {
  cnpj?: string | null;
  stateRegistration?: string | null;
  companyName?: string | null;
  uf?: string | null;
  crt?: string | null;
  nfeApiKey?: string | null;
  environment?: string | null;
  defaultNcm?: string | null;
  defaultCfop?: string | null;
  defaultOrigin?: string | null;
  defaultCsosn?: string | null;
  pisCofinsCst?: string | null;
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const filled = (v: unknown) => String(v ?? '').trim() !== '';

export function fiscalSetupProgress(config: FiscalSetupConfig | null | undefined) {
  const c = config ?? {};
  const empresa: string[] = [];
  if (digits(c.cnpj).length !== 14) empresa.push('CNPJ');
  if (!filled(c.stateRegistration)) empresa.push('Inscrição Estadual');
  if (!filled(c.companyName)) empresa.push('Razão social');
  if (!filled(c.uf)) empresa.push('UF');
  if (c.crt === '3') empresa.push('Regime: hoje só Simples Nacional');
  const emissor: string[] = filled(c.nfeApiKey) ? [] : ['Token da Focus NFe'];
  const tributacao: string[] = [];
  if (digits(c.defaultNcm).length !== 8) tributacao.push('NCM');
  if (!/^5\d{3}$/.test(digits(c.defaultCfop))) tributacao.push('CFOP');
  if (!filled(c.defaultOrigin)) tributacao.push('Origem');
  if (!filled(c.defaultCsosn)) tributacao.push('CSOSN');
  if (digits(c.pisCofinsCst).length !== 2) tributacao.push('CST de PIS/COFINS');
  const done = { empresa: empresa.length === 0, emissor: emissor.length === 0, tributacao: tributacao.length === 0 };
  const ready = done.empresa && done.emissor && done.tributacao;
  // Nothing saved yet: the checklist first; else the first step still missing something, or the review
  const resumeAt = !config ? 0 : !done.empresa ? 1 : !done.emissor ? 2 : !done.tributacao ? 3 : 4;
  return { done, missing: { empresa, emissor, tributacao }, ready, resumeAt };
}

export const formatCnpj = (v: string | null | undefined) =>
  digits(v).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

/** The text the owner sends to the accountant to get the default taxation of the products */
export function accountantMessage(c: { companyName?: string | null; cnpj?: string | null; uf?: string | null }) {
  return [
    `Olá! Vou emitir NFC-e pelo sistema Gastrux para ${c.companyName || 'a empresa'} (CNPJ ${formatCnpj(c.cnpj) || '...'}, ${c.uf || 'UF'}).`,
    'Preciso da tributação padrão dos produtos vendidos (comida e bebida preparadas no restaurante):',
    '- NCM (8 dígitos)',
    '- CFOP (venda dentro do estado, começa com 5)',
    '- Origem da mercadoria (0 a 8)',
    '- CSOSN (Simples Nacional: 102, 103, 300, 400 ou 500)',
    '- CST de PIS/COFINS (2 dígitos)',
    'Se algum produto for diferente (bebida com substituição tributária, por exemplo), me diga quais e os dados deles.',
  ].join('\n');
}
