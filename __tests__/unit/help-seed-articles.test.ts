/**
 * Help center sync (lib/help/seed-articles.ts, 2026-10-17): the 2026-10-11 articles promised an iFood
 * integration and a card machine connection that do not exist. The sync removes and replaces the old
 * defaults, but an article the team edited in Base de conhecimento is never overwritten or deleted.
 */
const articles = new Map<string, { id: string; slug: string; content: string }>();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    helpCategory: { upsert: jest.fn(async ({ create }: any) => ({ id: 'cat-' + create.slug })) },
    helpArticle: {
      findMany: jest.fn(async ({ where }: any) => [...articles.values()].filter((a) => where.slug.in.includes(a.slug))),
      findUnique: jest.fn(async ({ where }: any) => articles.get(where.slug) ?? null),
      delete: jest.fn(async ({ where }: any) => {
        for (const [k, v] of articles) if (v.id === where.id) articles.delete(k);
      }),
      create: jest.fn(async ({ data }: any) => articles.set(data.slug, { id: 'new-' + data.slug, ...data })),
      update: jest.fn(async ({ where, data }: any) => {
        for (const [k, v] of articles) if (v.id === where.id) articles.set(k, { ...v, ...data });
      }),
    },
  },
}));

import { HELP_ARTICLES, syncHelpContent } from '@/lib/help/seed-articles';

it('the ficha article tells the cost inside the product (2026-10-18)', () => {
  const a = HELP_ARTICLES.find((x) => x.slug === 'cadastrar-receita');
  for (const fact of ['Cardápio digital', 'margem', 'CMV', 'Editar ficha técnica']) expect([fact, a?.content.includes(fact)]).toEqual([fact, true]);
});

it('the stock article tells the batch entry (2026-10-18)', () => {
  const a = HELP_ARTICLES.find((x) => x.slug === 'controle-estoque-alertas');
  for (const fact of ['Entrada em lote', 'sem entrada ainda', 'custo por unidade']) expect([fact, a?.content.includes(fact)]).toEqual([fact, true]);
});

it('the WhatsApp menu article is in Delivery (2026-10-18)', () => {
  const a = HELP_ARTICLES.find((x) => x.slug === 'cardapio-no-whatsapp');
  expect(a?.categorySlug).toBe('integracao-delivery');
  for (const fact of ['Mensagem de saudação', 'Mensagem de ausência', '/cardapio', '14 dias', 'Site de delivery']) expect([fact, a?.content.includes(fact)]).toEqual([fact, true]);
});

it('contas a pagar has its article in Vendas e caixa (spec 2026-10-18 contas a pagar)', () => {
  const a = HELP_ARTICLES.find((x) => x.slug === 'contas-a-pagar');
  expect(a?.categorySlug).toBe('pdv-e-caixa');
  for (const fact of ['Nova conta', 'Parcelar', 'Repetir todo mês', 'gaveta', 'Desfazer pagamento', 'competência', 'CMV']) expect([fact, a?.content.includes(fact)]).toEqual([fact, true]);
});

it('the 2026-10-20 articles: reports, production plan, shifts and commissions, several stores', () => {
  const facts: Record<string, [string, string[]]> = {
    relatorios: ['financeiro', ['Lucratividade', 'margem de contribuição', 'sem custo', 'DRE', 'Baixar planilha (CSV)', 'Consumo de insumos']],
    'planejamento-producao': ['cardapio-e-receitas', ['Novo Plano', 'Inserir Item', 'Custo estimado', 'não dá baixa no estoque']],
    'turnos-comissoes': ['equipe-e-lojas', ['Folga', 'não registra ponto', '% das vendas', 'R$ por conta fechada', 'Fechar período', 'Marcar como paga']],
    'varias-lojas': ['equipe-e-lojas', ['Business tem 2 lojas', 'Nova Unidade', 'Alertas Cruzados', 'Sincronizar Fichas', 'Acessar']],
  };
  for (const [slug, [category, list]] of Object.entries(facts)) {
    const a = HELP_ARTICLES.find((x) => x.slug === slug);
    expect([slug, a?.categorySlug]).toEqual([slug, category]);
    for (const fact of list) expect([slug, fact, a?.content.includes(fact)]).toEqual([slug, fact, true]);
  }
  // Loyalty, cashback, the Financeiro forecasts and the PDF report do not work today: no article teaches them
  for (const a of HELP_ARTICLES) for (const word of ['Cashback', 'Previsões', 'Relatório executivo']) expect([a.slug, word, a.content.includes(word)]).toEqual([a.slug, word, false]);
});
import { prisma } from '@/lib/prisma';

// Exact 2026-10-11 texts (their hashes are in LEGACY_DEFAULT_HASHES)
const OLD_IFOOD =
  '## Integração com iFood\n\n1. Em **Admin → Integrações**, clique em **iFood**\n2. Informe seu token de merchant (painel iFood)\n3. Mapeie o cardápio (automático ou manual)\n4. Ative a sincronização\n\n### Fluxo\n\n- Pedidos chegam no KDS automaticamente\n- Status (aceito, em preparo, pronto, em entrega) sincroniza\n- Comprovantes e faturas em **Pedidos Externos**';
const OLD_BAIXAR_FATURA =
  '## Baixando faturas\n\n1. Acesse **Configurações → Assinatura**\n2. Vá até o histórico de faturas\n3. Baixe a fatura que precisar\n\nSe não encontrar uma fatura específica ou tiver dúvida sobre uma cobrança, abra um ticket de suporte — a equipe confirma os detalhes com você.';

beforeEach(() => {
  articles.clear();
  jest.clearAllMocks();
});

it('replaces an untouched old default and removes the false iFood article', async () => {
  articles.set('baixar-fatura', { id: 'a1', slug: 'baixar-fatura', content: OLD_BAIXAR_FATURA });
  articles.set('conectar-ifood', { id: 'a2', slug: 'conectar-ifood', content: OLD_IFOOD });

  const r = await syncHelpContent();

  expect(articles.has('conectar-ifood')).toBe(false);
  expect(articles.get('baixar-fatura')!.content).toContain('Gerenciar assinatura');
  expect(r.removed).toBe(1);
  expect(r.updated).toBe(1);
  expect(r.created).toBe(HELP_ARTICLES.length - 1);
});

it('keeps an article the team edited, even an obsolete one', async () => {
  articles.set('baixar-fatura', { id: 'a1', slug: 'baixar-fatura', content: 'Texto da equipe' });
  articles.set('conectar-ifood', { id: 'a2', slug: 'conectar-ifood', content: 'Integração iFood nova, escrita pela equipe' });

  await syncHelpContent();

  expect(articles.get('baixar-fatura')!.content).toBe('Texto da equipe');
  expect(articles.has('conectar-ifood')).toBe(true);
});

it('a second run changes nothing', async () => {
  await syncHelpContent();
  jest.clearAllMocks();
  const r = await syncHelpContent();
  expect(r).toMatchObject({ created: 0, updated: 0, removed: 0 });
  expect(prisma.helpArticle.update).not.toHaveBeenCalled();
});

it('no article promises iFood, a card machine or the old Admin menu', () => {
  for (const a of HELP_ARTICLES) {
    expect(a.content).not.toMatch(/Admin →|SumUp|token de merchant|maquininha/i);
  }
});
