/**
 * Ready-to-paste messages for the restaurant's WhatsApp Business app (2026-10-18, WhatsApp option A): the app's own
 * greeting, away message and quick reply send the delivery menu link. Gastrux cannot read or answer that app.
 */
export const QUICK_REPLY_SHORTCUT = 'cardapio';

// * and _ are WhatsApp bold/italic marks: inside the name they would break the bold
const cleanName = (name: string) => name.replace(/[*_~]/g, ' ').replace(/\s+/g, ' ').trim();

// No article before the name: "ao Pizzaria" and "o Pizzaria" read wrong, "chamar Pizzaria" reads right for any name
const thanks = (restaurantName: string) => {
  const name = cleanName(restaurantName);
  return name ? `Olá! 👋 Obrigado por chamar *${name}*.` : 'Olá! 👋 Obrigado pelo contato.';
};

export function greetingMessage(restaurantName: string, url: string): string {
  return `${thanks(restaurantName)} Veja nosso cardápio e faça seu pedido por aqui: ${url}`;
}

export function awayMessage(restaurantName: string, url: string): string {
  return `${thanks(restaurantName)} No momento estamos fechados, mas você já pode ver o cardápio e os horários por aqui: ${url}`;
}

export function quickReplyMessage(url: string): string {
  return `Aqui está o nosso cardápio, é só escolher e fazer o pedido: ${url}`;
}
