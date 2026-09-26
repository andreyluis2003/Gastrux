import { NextRequest, NextResponse } from 'next/server';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { verifyOAuthState, type OAuthStatePayload } from '@/lib/mercadopago-connect/oauth-state';
import { exchangeCodeForTokens } from '@/lib/mercadopago-connect/oauth-client';
import { saveConnection } from '@/lib/mercadopago-connect/connection-service';

export const dynamic = 'force-dynamic';

function back(req: NextRequest, result: string) {
  const base = process.env.NEXTAUTH_URL || req.url;
  return NextResponse.redirect(new URL(`/dashboard/pagamentos/conectar?mp=${result}`, base));
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;

  if (params.get('error')) return back(req, 'denied');

  const code = params.get('code');

  // verifyOAuthState throws when NEXTAUTH_SECRET is missing; treat that like an
  // invalid state instead of surfacing an unhandled 500.
  let payload: OAuthStatePayload | null = null;
  try {
    payload = verifyOAuthState(params.get('state') || '');
  } catch (error) {
    console.error('[mp-connect] state verification unavailable:', error instanceof Error ? error.message : error);
  }
  if (!code || !payload) return back(req, 'invalid_state');

  const mgr = await requireConnectManager();
  if (!mgr.ok) return back(req, 'unauthorized');

  // The state must have been minted for THIS user and THIS (current) restaurant.
  if (payload.restaurantId !== mgr.restaurantId || payload.userId !== mgr.userId) {
    return back(req, 'invalid_state');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveConnection(mgr.restaurantId, tokens);
    return back(req, 'connected');
  } catch (error) {
    console.error('[mp-connect] callback failed:', error instanceof Error ? error.message : error);
    return back(req, 'error');
  }
}
