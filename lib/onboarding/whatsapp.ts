/**
 * The owner's WhatsApp, asked at sign-up (activation agent, 2026-10-28). Stored as digits only,
 * 55 + DDD + number, which is what a wa.me link takes. Mobiles have 11 digits with the DDD and
 * landlines 10; a leading country code 55 is dropped before checking.
 */

type Result = { ok: true; value: string } | { ok: false; error: string };

export const WHATSAPP_ERROR = 'Informe o WhatsApp com DDD';

export function parseWhatsapp(raw: unknown): Result {
  if (typeof raw !== 'string') return { ok: false, error: WHATSAPP_ERROR };
  let digits = raw.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return { ok: false, error: WHATSAPP_ERROR };
  if (Number(digits.slice(0, 2)) < 11) return { ok: false, error: WHATSAPP_ERROR };
  return { ok: true, value: `55${digits}` };
}
