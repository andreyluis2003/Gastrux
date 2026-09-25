import { NextRequest, NextResponse } from 'next/server';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { createOAuthState } from '@/lib/mercadopago-connect/oauth-state';
import { buildAuthorizationUrl, isConnectConfigured } from '@/lib/mercadopago-connect/oauth-client';

export const dynamic = 'force-dynamic';

// The browser navigates to this route (window.location.href), so failures must
// redirect back to the connect page instead of showing raw JSON.
function back(req: NextRequest, result: string) {
  const base = process.env.NEXTAUTH_URL || req.url;
  return NextResponse.redirect(new URL(`/dashboard/pagamentos/conectar?mp=${result}`, base));
}

export async function GET(req: NextRequest) {
  const mgr = await requireConnectManager();
  if (!mgr.ok) return back(req, mgr.status === 401 || mgr.status === 403 ? 'unauthorized' : 'error');

  if (!isConnectConfigured()) return back(req, 'error');

  const state = createOAuthState({ restaurantId: mgr.restaurantId, userId: mgr.userId });
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
