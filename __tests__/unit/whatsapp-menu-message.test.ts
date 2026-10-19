/** Ready-to-paste WhatsApp Business messages with the delivery menu link (2026-10-18, WhatsApp option A) */
import { awayMessage, greetingMessage, quickReplyMessage, QUICK_REPLY_SHORTCUT } from '@/lib/delivery/whatsapp-menu';

const URL = 'https://gastrux.com/delivery/abc';

it('greeting: restaurant name in bold and the menu link', () => {
  expect(greetingMessage('Espetaria do Zé', URL)).toBe(
    'Olá! 👋 Bem-vindo(a) ao *Espetaria do Zé*. Veja nosso cardápio e faça seu pedido por aqui: https://gastrux.com/delivery/abc',
  );
});

it('away message and quick reply carry the same link', () => {
  expect(awayMessage('Espetaria do Zé', URL)).toBe(
    'Olá! 👋 No momento o *Espetaria do Zé* está fechado. Veja nosso cardápio e os horários por aqui: https://gastrux.com/delivery/abc',
  );
  expect(quickReplyMessage(URL)).toBe('Aqui está o nosso cardápio, é só escolher e fazer o pedido: https://gastrux.com/delivery/abc');
  expect(QUICK_REPLY_SHORTCUT).toBe('cardapio');
});

it('asterisks and underscores in the name never break the WhatsApp bold; a blank name leaves it out', () => {
  expect(greetingMessage('  *Bar_do* Zé ', URL)).toContain('ao *Bar do Zé*.');
  expect(greetingMessage('', URL)).toBe('Olá! 👋 Veja nosso cardápio e faça seu pedido por aqui: https://gastrux.com/delivery/abc');
  expect(awayMessage('  ', URL)).toBe('Olá! 👋 No momento estamos fechados. Veja nosso cardápio e os horários por aqui: https://gastrux.com/delivery/abc');
});
