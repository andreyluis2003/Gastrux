// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

function mask(value?: string | null) {
  if (!value) return '';
  if (value.length <= 6) return '••••••';
  return '••••••' + value.slice(-4);
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  let cfg = await prisma.voiceAgentConfig.findUnique({ where: { restaurantId } });
  if (!cfg) {
    cfg = await prisma.voiceAgentConfig.create({ data: { restaurantId } });
  }

  return NextResponse.json({
    config: {
      ...cfg,
      twilioAccountSid: mask(cfg.twilioAccountSid),
      twilioAuthToken: mask(cfg.twilioAuthToken),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();

  // Mascara defesa: só atualiza se não tem bullets
  const updateData: any = {};
  const allowedString = [
    'language', 'voice', 'greeting', 'goodbye', 'outsideHoursMessage', 'transferMessage',
    'twilioPhoneNumber', 'transferNumber',
  ];
  for (const k of allowedString) {
    if (body[k] !== undefined) updateData[k] = body[k];
  }
  if (body.twilioAccountSid !== undefined && !String(body.twilioAccountSid).includes('•')) {
    updateData.twilioAccountSid = body.twilioAccountSid;
  }
  if (body.twilioAuthToken !== undefined && !String(body.twilioAuthToken).includes('•')) {
    updateData.twilioAuthToken = body.twilioAuthToken;
  }

  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive;
  if (typeof body.allowReservations === 'boolean') updateData.allowReservations = body.allowReservations;
  if (typeof body.allowInfo === 'boolean') updateData.allowInfo = body.allowInfo;
  if (typeof body.allowTransfer === 'boolean') updateData.allowTransfer = body.allowTransfer;
  if (body.provider === 'TWILIO' || body.provider === 'MOCK') updateData.provider = body.provider;
  if (body.businessHours !== undefined) updateData.businessHours = body.businessHours;
  if (typeof body.minAdvanceMinutes === 'number') updateData.minAdvanceMinutes = body.minAdvanceMinutes;
  if (typeof body.maxAdvanceDays === 'number') updateData.maxAdvanceDays = body.maxAdvanceDays;
  if (typeof body.maxPartySize === 'number') updateData.maxPartySize = body.maxPartySize;
  if (typeof body.defaultDurationMin === 'number') updateData.defaultDurationMin = body.defaultDurationMin;

  const cfg = await prisma.voiceAgentConfig.upsert({
    where: {},
    update: updateData,
    create: { restaurantId, ...updateData },
  });

  return NextResponse.json({
    config: {
      ...cfg,
      twilioAccountSid: mask(cfg.twilioAccountSid),
      twilioAuthToken: mask(cfg.twilioAuthToken),
    },
  });
}
