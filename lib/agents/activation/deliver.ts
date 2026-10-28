/**
 * How an approved message of the activation agent reaches the client (spec 2026-10-27): the e-mail in
 * the onboarding e-mails' look, with the "Parar as dicas" link; the WhatsApp as a wa.me link the team
 * opens and sends (stage 2 sends from the official number).
 */
import { unsubscribeUrl } from '@/lib/onboarding/emails';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#335538">${url}</a>`);

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function agentEmailHtml(text: string, userId: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2937">${linkify(escapeHtml(block)).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return [
    '<div style="background:#F7F8F2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">',
    '<p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#142D27">gastrux</p>',
    paragraphs,
    '</div>',
    '<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">',
    'Você recebe estas dicas porque criou uma conta no Gastrux. ',
    `<a href="${unsubscribeUrl(userId)}" style="color:#6b7280">Parar as dicas</a>. Os avisos da sua conta (fim do teste, senha) continuam.`,
    '</p></div>',
  ].join('');
}
