/**
 * Fixed texts of the activation agent (spec 2026-10-27), used when the AI is off or its draft breaks a
 * rule. Same tone as the onboarding e-mails (lib/onboarding/emails.ts): short, plain, one next step,
 * one link, signed "Equipe Gastrux". Nothing here offers a discount, a longer trial or a feature that
 * is not in lib/ai/knowledge.
 */
import type { ActivationTrigger } from './rules';

export interface TemplateContext {
  firstName: string | null;
  restaurantName: string;
  /** The one link of the message: the next step's screen */
  link: string;
  stepLabel: string | null;
}

export type ClientChannel = 'EMAIL' | 'WHATSAPP';

interface Copy {
  subject: string;
  /** Message body, before the link */
  body: (c: TemplateContext) => string;
  /** Shorter body for WhatsApp; the e-mail one when absent */
  short?: (c: TemplateContext) => string;
  /** Line after the link */
  after?: string;
}

const step = (c: TemplateContext, fallback: string) => (c.stepLabel ? c.stepLabel.charAt(0).toLowerCase() + c.stepLabel.slice(1) : fallback);

const COPY: Record<ActivationTrigger, Copy> = {
  boas_vindas: {
    subject: 'Bem-vindo ao Gastrux: vamos para a primeira venda',
    body: (c) =>
      `Que bom ter o ${c.restaurantName} no Gastrux! Para começar rápido: no Início, toque em "Fazer com a IA" e mande fotos do seu cardápio, que a IA monta os produtos para você revisar. Os vídeos da trilha "Comece por aqui" mostram cada tela em poucos minutos. Se quiser, marcamos 15 minutos para montar junto: é só responder esta mensagem.`,
    short: (c) =>
      `Que bom ter o ${c.restaurantName} no Gastrux! Dica para começar: no Início, toque em "Fazer com a IA" e mande fotos do cardápio, que a IA monta os produtos. Se quiser, marcamos 15 minutos para montar junto, é só responder aqui.`,
  },
  cardapio_parado: {
    subject: 'Seu cardápio no Gastrux em poucos minutos',
    body: () =>
      'Vi que os seus produtos ainda não estão no Gastrux. O jeito mais rápido: mande fotos ou o PDF do cardápio no "Fazer com a IA", no Início. Você revisa nomes e preços antes de confirmar.',
  },
  sem_caixa: {
    subject: 'Próximo passo: abrir o caixa',
    body: () => 'Seu cardápio já está pronto. O próximo passo é abrir o caixa com o troco inicial: leva menos de um minuto, e depois já dá para vender.',
  },
  sem_venda: {
    subject: 'Que tal fazer a primeira venda hoje?',
    body: () => 'O caixa já foi aberto. Agora é só fazer a primeira venda: toque numa mesa ou no balcão, escolha os itens e receba. Pode ser uma venda de teste.',
  },
  sumiu: {
    subject: 'Ficou alguma dúvida no Gastrux?',
    body: (c) => `Faz alguns dias que você não entra no Gastrux. Ficou alguma dúvida? O próximo passo é ${step(c, 'fazer a primeira venda')}. Se travou em algo, responda esta mensagem que a gente ajuda.`,
  },
  primeira_venda: {
    subject: 'Parabéns pela primeira venda no Gastrux!',
    body: (c) => `Parabéns pela primeira venda do ${c.restaurantName} no Gastrux! Para aproveitar mais, o próximo passo é ${step(c, 'cadastrar as mesas')}.`,
  },
  fim_teste_vendendo: {
    subject: 'Seu teste do Gastrux está acabando',
    body: (c) => `O teste do ${c.restaurantName} acaba em poucos dias. Para continuar vendendo sem parar, escolha o seu plano.`,
  },
  fim_teste_sem_venda: {
    subject: 'Seu teste do Gastrux está acabando',
    body: (c) => `O teste do ${c.restaurantName} acaba em poucos dias e ainda dá tempo de fazer a primeira venda. O próximo passo é ${step(c, 'abrir o caixa')}. Se quiser, montamos junto em 15 minutos: é só responder esta mensagem.`,
  },
  travou: {
    subject: 'Posso ajudar com o Gastrux?',
    body: (c) => `Notei que o ${c.restaurantName} parou no mesmo passo nos últimos dias. O próximo é ${step(c, 'fazer a primeira venda')}. Quer ajuda? Responda esta mensagem e a gente faz junto.`,
  },
  o_que_faltou: {
    subject: 'O que faltou para o Gastrux servir para você?',
    body: () => 'Seu teste do Gastrux acabou. Queria te fazer uma pergunta só: O que faltou para o Gastrux servir para você? Sua resposta ajuda muito.',
    after: 'Se quiser voltar, os planos estão no link acima.',
  },
};

export function templateFor(trigger: ActivationTrigger, channel: ClientChannel, c: TemplateContext): { subject: string | null; text: string } {
  const copy = COPY[trigger];
  const hello = c.firstName ? `Oi, ${c.firstName}!` : 'Oi!';
  const body = channel === 'WHATSAPP' && copy.short ? copy.short(c) : copy.body(c);
  const text = [hello, body, c.link, copy.after, 'Equipe Gastrux'].filter(Boolean).join('\n\n');
  return { subject: channel === 'EMAIL' ? copy.subject : null, text };
}
