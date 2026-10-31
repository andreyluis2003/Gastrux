/**
 * The ten utility templates of the Gastrux official number, submitted to Meta on 2026-10-31 (WABA
 * 1101798518937750, pt_BR, footer "Equipe Gastrux", URL button https://gastrux.com/{{1}}). A template sent
 * must match its text at Meta, so these bodies are a record of what the client receives. Changing one here
 * is not enough: the new text has to be approved at Meta first.
 */
import type { ActivationTrigger } from '../activation/rules';

const BODIES: Record<ActivationTrigger, string> = {
  boas_vindas: 'Oi, {{1}}! Que bom ter o {{2}} no Gastrux. Para começar, toque em "Fazer com a IA" e mande fotos do cardápio, que a IA monta os produtos. Se quiser, marcamos 15 minutos para montar junto: é só responder aqui.',
  cardapio_parado: 'Oi, {{1}}! Seus produtos ainda não estão no Gastrux. Mande fotos ou o PDF do cardápio no "Fazer com a IA", e você revisa nomes e preços antes de confirmar.',
  sem_caixa: 'Oi, {{1}}! O cardápio do {{2}} já está pronto. O próximo passo é abrir o caixa com o troco inicial. Leva menos de um minuto, e depois já dá para vender.',
  sem_venda: 'Oi, {{1}}! O caixa do {{2}} já foi aberto. Agora é só fazer a primeira venda: toque numa mesa ou no balcão, escolha os itens e receba. Pode ser uma venda de teste.',
  sumiu: 'Oi, {{1}}! Faz alguns dias que você não entra no Gastrux. Ficou alguma dúvida? Responda aqui, que a gente ajuda.',
  travou: 'Oi, {{1}}! O {{2}} parou no mesmo passo nos últimos dias. Quer ajuda? Responda aqui, e a gente faz junto.',
  primeira_venda: 'Oi, {{1}}! Parabéns pela primeira venda do {{2}} no Gastrux! Veja qual é o próximo passo para aproveitar mais.',
  fim_teste_vendendo: 'Oi, {{1}}! O teste do {{2}} acaba em poucos dias. Para continuar usando sem interrupção, escolha seu plano.',
  fim_teste_sem_venda: 'Oi, {{1}}! O teste do {{2}} acaba em poucos dias, e ainda dá tempo de fazer a primeira venda. Se quiser, montamos junto em 15 minutos: é só responder aqui.',
  o_que_faltou: 'Oi, {{1}}! Seu teste do Gastrux acabou. Uma pergunta só: o que faltou para o Gastrux servir para você? Sua resposta ajuda muito.',
};

export interface RenderedTemplate {
  name: string;
  bodyParams: string[];
  /** Path after https://gastrux.com/ for the button */
  linkPath: string;
  /** What the client reads */
  text: string;
}

/** The screen the drafted message points to, for the button; the home when it has no link */
function linkPathOf(draft: string): string {
  const url = draft.match(/https?:\/\/[^\s]+/)?.[0];
  if (!url) return 'dashboard';
  try {
    const { pathname, search } = new URL(url);
    return `${pathname}${search}`.replace(/^\/+/, '') || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

export function renderTemplate(trigger: string, c: { firstName: string | null; restaurantName: string; draft: string }): RenderedTemplate | null {
  const body = BODIES[trigger as ActivationTrigger];
  if (!body) return null;
  const name = c.firstName?.trim() || c.restaurantName;
  return {
    name: trigger,
    bodyParams: body.includes('{{2}}') ? [name, c.restaurantName] : [name],
    linkPath: linkPathOf(c.draft),
    text: `${body.replace('{{1}}', name).replace('{{2}}', c.restaurantName)}\n\nEquipe Gastrux`,
  };
}
