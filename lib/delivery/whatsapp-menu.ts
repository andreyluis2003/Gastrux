/**
 * Ready-to-paste messages for the restaurant's WhatsApp Business app (2026-10-18, WhatsApp option A): the app's own
 * greeting, away message and quick reply send the delivery menu link. Gastrux cannot read or answer that app.
 */
export const QUICK_REPLY_SHORTCUT = 'cardapio';

// * and _ are WhatsApp bold/italic marks: inside the name they would break the bold
const cleanName = (name: string) => name.replace(/[*_~]/g, ' ').replace(/\s+/g, ' ').trim();

export function greetingMessage(restaurantName: string, url: string): string {
  const name = cleanName(restaurantName);
  return name
    ? `Olá! 👋 Bem-vindo(a) ao *${name}*. Veja nosso cardápio e faça seu pedido por aqui: ${url}`
    : `Olá! 👋 Veja nosso cardápio e faça seu pedido por aqui: ${url}`;
}

export function awayMessage(restaurantName: string, url: string): string {
  const name = cleanName(restaurantName);
  return name
    ? `Olá! 👋 No momento o *${name}* está fechado. Veja nosso cardápio e os horários por aqui: ${url}`
    : `Olá! 👋 No momento estamos fechados. Veja nosso cardápio e os horários por aqui: ${url}`;
}

export function quickReplyMessage(url: string): string {
  return `Aqui está o nosso cardápio, é só escolher e fazer o pedido: ${url}`;
}
