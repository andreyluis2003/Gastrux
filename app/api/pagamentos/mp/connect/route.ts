import { NextResponse } from 'next/server';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { getConnection, disconnect } from '@/lib/mercadopago-connect/connection-service';
import { isConnectConfigured } from '@/lib/mercadopago-connect/oauth-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const conn = await getConnection(restaurantId);
  // Never return tokens (encrypted or not) - only what the UI needs to render.
  return NextResponse.json({
    configured: isConnectConfigured(),
    connected: conn?.status === 'ACTIVE',
    needsReconnect: conn?.status === 'NEEDS_RECONNECT',
    mpUserId: conn?.mpUserId ?? null,
    liveMode: conn?.liveMode ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
  });
}

export async function DELETE() {
  const mgr = await requireConnectManager();
  if (!mgr.ok) return NextResponse.json({ error: mgr.error }, { status: mgr.status });

  await disconnect(mgr.restaurantId);
  return NextResponse.json({ ok: true });
}
