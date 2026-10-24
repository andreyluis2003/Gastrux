import { NextRequest, NextResponse } from 'next/server';
import { findReferrer } from '@/lib/referrals/signup';

export const dynamic = 'force-dynamic';

/** GET /api/referrals/lookup?code= - public: who referred (only the restaurant's name), for the signup page */
export async function GET(req: NextRequest) {
  const referrer = await findReferrer(req.nextUrl.searchParams.get('code'));
  if (!referrer) return NextResponse.json({ error: 'Código de indicação não encontrado' }, { status: 404 });
  return NextResponse.json({ name: referrer.name });
}
