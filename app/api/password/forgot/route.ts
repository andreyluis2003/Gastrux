import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth/password-reset';

export const dynamic = 'force-dynamic';

/** Same answer whether or not the e-mail has an account (lib/auth/password-reset.ts). */
const ANSWER = {
  message: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.',
};

/** "an***@gmail.com": enough to recognise in the logs, not a list of addresses */
function maskEmail(raw: unknown): string {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.indexOf('@');
  if (at < 1) return '(e-mail inválido)';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const outcome = await requestPasswordReset(body?.email);
    // Every outcome goes to the server log (masked e-mail), so "the e-mail did not arrive" can be
    // answered from the logs: sent, no-account (or Google-only / inactive), rate-limited, invalid-email
    console.info(`[password reset] ${outcome.sent ? 'link sent' : `not sent: ${outcome.reason}`} for ${maskEmail(body?.email)}`);
  } catch (error) {
    // The e-mail provider failed: logged for the team, never revealed to the caller
    console.error('[password reset] could not send the link:', error);
  }
  return NextResponse.json(ANSWER);
}
