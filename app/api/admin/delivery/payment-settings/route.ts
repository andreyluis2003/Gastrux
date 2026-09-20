import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantManager } from '@/lib/mercadopago-connect/guard';
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
import { parseSettingsInput, type DeliveryPaymentSettingsData } from '@/lib/delivery-payments/choice';
import {
  getDeliveryPaymentSettings,
  saveDeliveryPaymentSettings,
} from '@/lib/delivery-payments/settings-service';

export const dynamic = 'force-dynamic';

/**
 * Authorized by membership in the CURRENT restaurant, not by the global JWT
 * role (ruling R20): the owner, or an active OWNER/ADMIN/MANAGER member.
 */
function authorize() {
  return requireRestaurantManager(
    ['OWNER', 'ADMIN', 'MANAGER'],
    'Apenas o dono, administrador ou gerente pode alterar as formas de pagamento'
  );
}

async function respond(restaurantId: string, settings: DeliveryPaymentSettingsData) {
  const connected = await hasActiveConnection(restaurantId);
  return NextResponse.json({ settings, online: { connected } });
}

export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return respond(auth.restaurantId, await getDeliveryPaymentSettings(auth.restaurantId));
}

/** The restaurant always comes from the session: a restaurantId in the body is ignored. */
export async function PUT(request: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = parseSettingsInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await saveDeliveryPaymentSettings(auth.restaurantId, parsed.data);
  return respond(auth.restaurantId, saved);
}
