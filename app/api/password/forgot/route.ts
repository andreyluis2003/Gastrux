import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth/password-reset';

export const dynamic = 'force-dynamic';

/** Same answer whether or not the e-mail has an account (lib/auth/password-reset.ts). */
const ANSWER = {
  message: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.',
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    await requestPasswordReset(body?.email);
  } catch (error) {
    // The e-mail provider failed: logged for the team, never revealed to the caller
    console.error('[password reset] could not send the link:', error);
  }
  return NextResponse.json(ANSWER);
}
