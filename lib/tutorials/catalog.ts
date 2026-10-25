import { canSeeModule } from '@/lib/navigation/app-nav';

/**
 * Tutorial videos (spec 2026-10-25 tutoriais-em-video): one per menu item, made in the gastrux-videos
 * project and served from NEXT_PUBLIC_TUTORIAL_VIDEO_BASE. Only published ones show anywhere.
 */
export type Tutorial = {
  slug: string;
  title: string;
  /** Id of the menu group (NAV_GROUPS) the video is listed under */
  group: string;
  /** Screens where "Vídeo desta tela" shows; the first one is the "Abrir esta tela" button */
  routes: string[];
  summary: string;
  /** The written step by step (same script as the narration) */
  steps: string[];
  durationSec: number;
  /** Position in the "Comece por aqui" track */
  essentialOrder?: number;
  published: boolean;
};

const t = (slug: string, title: string, group: string, routes: string[], summary: string, essentialOrder?: number): Tutorial => ({
  slug,
  title,
  group,
  routes,
  summary,
  steps: [],
  durationSec: 0,
  essentialOrder,
  published: false,
});

export const TUTORIALS: Tutorial[] = [
  // Comece por aqui (implantation order)
  t('conhecendo-o-painel', 'Conhecendo o painel', 'inicio', ['/dashboard'], 'O resumo do dia, o menu e onde achar cada coisa.', 1),
  t('insumos', 'Cadastrando insumos', 'cardapio', ['/insumos'], 'Os ingredientes que você compra, com unidade e preço.', 2),
  t('fichas-tecnicas', 'Fichas técnicas e custo do prato', 'cardapio', ['/receitas'], 'O que vai em cada prato e quanto ele custa.', 3),
  t('cardapio-digital', 'Produtos e cardápio', 'cardapio', ['/admin/cardapio'], 'Produtos, categorias e preços de venda.', 4),
  t('cadastro-de-mesas', 'Cadastrando as mesas', 'vender', ['/admin/tables'], 'As mesas e áreas do salão.', 5),
  t('caixa', 'Abrindo e fechando o caixa', 'caixa', ['/caixa', '/caixa/historico'], 'Troco inicial, sangria, despesa e fechamento.', 6),
  t('mesas-e-balcao', 'Vendendo: mesas, comanda e balcão', 'vender', ['/vender', '/comanda'], 'Abrir a mesa, lançar, enviar para a cozinha e fechar a conta.', 7),
  t('cozinha-kds', 'A tela da cozinha', 'vender', ['/cozinha'], 'Os pedidos chegando, em preparo e prontos.', 8),
  t('equipe-e-acessos', 'Equipe e acessos', 'equipe', ['/admin/staff'], 'Convidar a equipe e escolher o que cada um vê.', 9),

  // Vender
  t('pedidos-de-delivery', 'Pedidos de delivery', 'vender', ['/admin/integrations/orders'], 'Receber, aceitar e acompanhar os pedidos de entrega.'),
  t('contagem-do-dia', 'Contagem do dia', 'vender', ['/contagem-do-dia'], 'Quantas unidades de cada item você tem para vender hoje.'),
  // Caixa e pagamentos
  t('pagamentos-online', 'Pagamentos online', 'caixa', ['/dashboard/pagamentos'], 'PIX e cartão pelo celular, e estornos.'),
  t('contas-a-pagar', 'Contas a pagar', 'caixa', ['/contas-a-pagar'], 'As contas do restaurante e os vencimentos.'),
  // Cardápio e produtos
  t('adicionais', 'Adicionais', 'cardapio', ['/admin/modifiers'], 'Ponto da carne, extras e opções dos produtos.'),
  t('qr-codes-das-mesas', 'QR Codes das mesas', 'cardapio', ['/admin/tables/qrcodes'], 'Imprimir o QR Code de cada mesa.'),
  // Estoque e compras
  t('estoque', 'Estoque', 'estoque', ['/estoque'], 'Quanto tem de cada insumo e o que está acabando.'),
  t('contagem-de-estoque', 'Contagem de estoque', 'estoque', ['/contagem'], 'Contar o estoque e acertar as diferenças.'),
  t('compras', 'Compras', 'estoque', ['/compras'], 'Registrar o que chegou do fornecedor.'),
  t('desperdicio', 'Desperdício', 'estoque', ['/desperdicio'], 'Registrar o que foi perdido e por quê.'),
  t('fornecedores', 'Fornecedores', 'estoque', ['/fornecedores'], 'Os contatos de quem vende para você.'),
  t('importar-nota-de-compra', 'Importar nota de compra', 'estoque', ['/admin/nfe-import'], 'Dar entrada no estoque a partir do XML da nota.'),
  // Fiscal
  t('nfce', 'Configurando a NFC-e', 'fiscal', ['/admin/fiscal'], 'Certificado, dados fiscais e emissão da nota ao fechar a conta.'),
  t('notas-emitidas', 'Notas emitidas', 'fiscal', ['/admin/nfe/documents'], 'Consultar, baixar e cancelar notas.'),
  // Relatórios
  t('cmv', 'CMV', 'relatorios', ['/cmv'], 'Quanto do que você vende vira custo.'),
  t('consumo-de-insumos', 'Consumo de insumos', 'relatorios', ['/consumo-analise'], 'O que saiu do estoque em cada período.'),
  t('vendas', 'Relatório de vendas', 'relatorios', ['/dashboard/reports/sales'], 'Vendas por dia, produto e forma de pagamento.'),
  t('lucratividade', 'Lucratividade', 'relatorios', ['/dashboard/reports/profitability'], 'Quais produtos dão mais lucro.'),
  t('financeiro', 'Financeiro', 'relatorios', ['/dashboard/financeiro', '/dashboard/financeiro/contas'], 'Entradas, saídas e contas de consumo.'),
  t('relatorio-executivo', 'Relatório executivo (PDF)', 'relatorios', ['/relatorios'], 'O resumo do mês num PDF.'),
  // Clientes e marketing
  t('clientes-crm', 'Clientes (CRM)', 'clientes', ['/dashboard/crm'], 'Quem são seus clientes e quanto compram.'),
  t('cashback', 'Cashback', 'clientes', ['/admin/cashback'], 'Dar crédito para o cliente voltar.'),
  t('campanhas', 'Campanhas', 'clientes', ['/admin/messaging/campaigns'], 'Mandar mensagens para os seus clientes.'),
  t('site-de-delivery', 'Site de delivery', 'clientes', ['/admin/delivery-site'], 'A sua loja de delivery própria, sem comissão.'),
  // Mais recursos
  t('planejamento-de-producao', 'Planejamento de produção', 'mais', ['/planejamento'], 'Quanto preparar para o dia.'),
  t('escalonar-receita', 'Escalonar receita', 'mais', ['/escalonamento'], 'Aumentar ou diminuir o rendimento de uma receita.'),
  t('etiquetas-e-validades', 'Etiquetas e validades', 'mais', ['/etiquetas', '/etiquetas/validades'], 'Imprimir etiquetas e controlar o que vence.'),
  t('engenharia-de-cardapio', 'Engenharia de cardápio', 'mais', ['/engenharia-cardapio'], 'Quais pratos valem a pena destacar.'),
  t('dre', 'DRE', 'mais', ['/dashboard/financeiro/dre'], 'O resultado do mês, do faturamento ao lucro.'),
  t('turnos', 'Turnos', 'mais', ['/admin/staff/shifts'], 'Os turnos de trabalho da equipe.'),
  t('comissoes', 'Comissões', 'mais', ['/admin/staff/commissions'], 'A comissão de cada garçom.'),
  // Configurações
  t('configuracoes-do-restaurante', 'Configurações do restaurante', 'config', ['/admin/settings'], 'Dados do restaurante, taxa de serviço e impressão.'),
  t('minha-assinatura', 'Minha assinatura', 'config', ['/dashboard/billing'], 'Seu plano, pagamento e indicações.'),
  t('whatsapp', 'WhatsApp', 'config', ['/admin/integrations/whatsapp'], 'Ligar o WhatsApp do restaurante.'),
  t('api-de-pedidos', 'API de pedidos', 'config', ['/admin/integrations/api'], 'Receber pedidos de outros sistemas.'),
  t('varias-lojas', 'Várias lojas', 'config', ['/admin/multi-location'], 'Acompanhar mais de uma loja.'),
  t('uso-da-ia', 'Uso da IA', 'config', ['/admin/settings/ia'], 'Quanto o assistente foi usado no mês.'),
];

const BASE = process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_BASE ?? '/videos/tutoriais';

export const tutorialVideoUrl = (slug: string): string => `${BASE}/${slug}.mp4`;
export const tutorialPosterUrl = (slug: string): string => `${BASE}/${slug}.jpg`;

/** Published videos of the screens this role can open, in catalog order */
export function tutorialsFor(role: string | null | undefined): Tutorial[] {
  return TUTORIALS.filter((x) => x.published && canSeeModule(x.routes[0], role));
}

/** The "Comece por aqui" track for this role */
export function essentialTrack(role: string | null | undefined): Tutorial[] {
  return tutorialsFor(role)
    .filter((x) => x.essentialOrder !== undefined)
    .sort((a, b) => a.essentialOrder! - b.essentialOrder!);
}

/** The video of the current screen: the longest route that matches (Início only on its own page) */
export function tutorialForPath(pathname: string, role: string | null | undefined): Tutorial | null {
  let best: Tutorial | null = null;
  let bestLen = -1;
  for (const x of tutorialsFor(role)) {
    for (const r of x.routes) {
      const hit = r === '/dashboard' ? pathname === r : pathname === r || pathname.startsWith(r + '/');
      if (hit && r.length > bestLen) {
        best = x;
        bestLen = r.length;
      }
    }
  }
  return best;
}

export function tutorialBySlug(slug: string): Tutorial | null {
  return TUTORIALS.find((x) => x.slug === slug && x.published) ?? null;
}

/** Next video: the next of the track while in it, else the next in the catalog */
export function nextTutorial(slug: string, role: string | null | undefined): Tutorial | null {
  const track = essentialTrack(role);
  const inTrack = track.findIndex((x) => x.slug === slug);
  if (inTrack >= 0 && inTrack < track.length - 1) return track[inTrack + 1];
  const all = tutorialsFor(role);
  const i = all.findIndex((x) => x.slug === slug);
  const rest = all.slice(i + 1).filter((x) => x.essentialOrder === undefined);
  return rest[0] ?? null;
}

/** A video counts as watched from 90% of its length (the player also counts the end) */
export function watchedAt(currentTime: number, duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && currentTime / duration >= 0.9;
}

/** The video of each "Primeiros passos" step (lib/onboarding/first-steps.ts), by step: "Abrir o caixa" opens /vender */
const FIRST_STEP_VIDEO: Record<string, string> = {
  caixa: 'caixa',
  venda: 'mesas-e-balcao',
  cardapio: 'cardapio-digital',
  mesas: 'cadastro-de-mesas',
  equipe: 'equipe-e-acessos',
  endereco: 'configuracoes-do-restaurante',
  nfce: 'nfce',
};

export function tutorialForFirstStep(key: string): Tutorial | null {
  const slug = FIRST_STEP_VIDEO[key];
  return slug ? tutorialBySlug(slug) : null;
}
