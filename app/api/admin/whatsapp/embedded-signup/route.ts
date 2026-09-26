import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  registerPhoneNumber,
} from '@/lib/whatsapp/embedded-signup';

export const dynamic = 'force-dynamic';

/**
 * Completes the server-side half of WhatsApp Embedded Signup v4. The client
 * (app/admin/integrations/whatsapp/page.tsx) calls this right after
 * FB.login({config_id}) resolves, passing the short-lived `code` plus the
 * phone_number_id/waba_id read from the WA_EMBEDDED_SIGNUP postMessage event.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { code, phoneNumberId, wabaId, businessId } = body || {};
  if (!code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: 'code, phoneNumberId e wabaId são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const { accessToken } = await exchangeCodeForToken(code);
    await subscribeAppToWaba(wabaId, accessToken);

    // Two-step verification PIN required by /register. Not persisted: it's
    // only needed at registration time, and re-registration (rare — e.g.
    // after Meta unbans a number) goes through this same flow again.
    const pin = crypto.randomInt(100000, 999999).toString();
    await registerPhoneNumber(phoneNumberId, accessToken, pin);

    const config = await prisma.whatsAppConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        phoneNumberId,
        businessAccountId: wabaId,
        metaBusinessId: businessId || null,
        accessToken,
        isActive: true,
      },
      update: {
        phoneNumberId,
        businessAccountId: wabaId,
        metaBusinessId: businessId || null,
        accessToken,
        isActive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      config: { id: config.id, phoneNumberId: config.phoneNumberId, isActive: config.isActive },
    });
  } catch (err: any) {
    console.error('[whatsapp-embedded-signup] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Falha ao conectar WhatsApp' }, { status: 500 });
  }
}
