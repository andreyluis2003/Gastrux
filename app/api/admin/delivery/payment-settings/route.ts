import { NextRequest, NextResponse } from 'next/server';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
import { parseSettingsInput } from '@/lib/delivery-payments/choice';
import {
  getDeliveryPaymentSettings,
  saveDeliveryPaymentSettings,
} from '@/lib/delivery-payments/settings-service';

export const dynamic = 'force-dynamic';

async function resolveRestaurant() {
  const auth = await requireAdminSession();
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return { error: NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 }) };
  }
  return { restaurantId };
}

async function payload(restaurantId: string) {
  const [settings, connected] = await Promise.all([
    getDeliveryPaymentSettings(restaurantId),
    hasActiveConnection(restaurantId),
  ]);
  return { settings, online: { connected } };
}

export async function GET() {
  const ctx = await resolveRestaurant();
  if ('error' in ctx) return ctx.error;
  return NextResponse.json(await payload(ctx.restaurantId));
}

/** The restaurant always comes from the session: a restaurantId in the body is ignored. */
export async function PUT(request: NextRequest) {
  const ctx = await resolveRestaurant();
  if ('error' in ctx) return ctx.error;

  const parsed = parseSettingsInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await saveDeliveryPaymentSettings(ctx.restaurantId, parsed.data);
  return NextResponse.json(await payload(ctx.restaurantId));
}
