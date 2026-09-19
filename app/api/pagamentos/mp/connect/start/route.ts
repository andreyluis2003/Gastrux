import { NextResponse } from 'next/server';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { createOAuthState } from '@/lib/mercadopago-connect/oauth-state';
import { buildAuthorizationUrl, isConnectConfigured } from '@/lib/mercadopago-connect/oauth-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mgr = await requireConnectManager();
  if (!mgr.ok) return NextResponse.json({ error: mgr.error }, { status: mgr.status });

  if (!isConnectConfigured()) {
    return NextResponse.json({ error: 'Integração com o Mercado Pago não configurada' }, { status: 503 });
  }

  const state = createOAuthState({ restaurantId: mgr.restaurantId, userId: mgr.userId });
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
