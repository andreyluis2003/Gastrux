/**
 * Plans of 2026-10-18 (spec planos-teste-business §9): nobody reads about a free plan forever, the
 * Starter or the old prices. Terms of use approved by the owner on 2026-10-18.
 */
import fs from 'fs';
import path from 'path';

const FILES = [
  'app/page.tsx', 'app/pricing/page.tsx', 'app/para/[segmento]/segment-client.tsx', 'lib/marketing/segments.ts',
  'app/lp/[campaign]/ppc-client.tsx', 'lib/marketing/ppc-campaigns.ts', 'app/calculadora/page.tsx',
  'components/marketing/faq-section.tsx', 'components/marketing/how-it-works.tsx', 'components/marketing/trust-section.tsx',
  'components/marketing/why-gastrux.tsx', 'lib/ab-testing.ts',
  'lib/onboarding/emails.ts',
  'app/api/billing/checkout-session/route.ts', 'app/api/billing/mp/checkout-session/route.ts',
  'app/dashboard/billing/page.tsx', 'app/conta/cobranca/page.tsx', 'app/conta/page.tsx', 'app/settings/page.tsx',
  'components/tier/upgrade-banner.tsx', 'components/upgrade-modal.tsx', 'components/transaction-limit-badge.tsx',
  'app/dashboard/usage/page.tsx', 'lib/plans/monthly-sales.ts',
  'lib/help/seed-articles.ts', 'lib/ai/knowledge/planos.ts', 'lib/ai/knowledge/implantacao.ts',
  'lib/ai/knowledge/pagamento-mesa.ts', 'lib/ai/knowledge/vender.ts', 'app/termos/page.tsx',
];
const FORBIDDEN: RegExp[] = [
  /gr[aá]tis para sempre/i, /gratuito para sempre/i, /gratuitamente/i, /Starter \(Gr[aá]tis\)/, /Starter gr[aá]tis/i,
  /plano Starter/i, /no Starter/, /R\$ ?99\b/, /R\$ ?249\b/, /Come[cç]ar Gr[aá]tis/i, /Comece gr[aá]tis/i,
  /Come[cç]a gr[aá]tis/i, /Criar Conta Gr[aá]tis/i, /Plano gr[aá]tis/i, /'R\$ 0'/,
];

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe.each(FILES)('%s', (file) => {
  it.each(FORBIDDEN.map((r) => [r.source, r] as const))('has no /%s/', (_source, re) => {
    // Only what a person reads: code comments may still name the old plan
    const text = read(file).split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    expect(text).not.toMatch(re);
  });
});

it('landing and pricing say the trial', () => {
  for (const f of ['app/page.tsx', 'app/pricing/page.tsx']) {
    expect(read(f)).toContain('Teste grátis por 30 dias, com tudo do Business');
  }
});

it('terms of use: the plans and the trial as approved by the owner (2026-10-18)', () => {
  const terms = read('app/termos/page.tsx');
  expect(terms).not.toMatch(/\bStarter\b/);
  expect(terms).toContain('conforme o plano contratado (Pro, Business ou Enterprise).');
  expect(terms).toContain('Ao se cadastrar, um restaurante é criado automaticamente com 30 dias de teste gratuito, com os recursos do plano Business. Ao fim do teste, sem um plano contratado, a conta fica disponível apenas para consulta e exportação dos dados, até a contratação de um plano.');
});
