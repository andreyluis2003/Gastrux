// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 6) return '••••••';
  return '••••••' + value.slice(-4);
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
  }

  let config = await prisma.whatsAppConfig.findUnique({ where: { restaurantId } });
  if (!config) {
    config = await prisma.whatsAppConfig.create({ data: { restaurantId } });
  }

  return NextResponse.json({
    config: {
      ...config,
      accessToken: mask(config.accessToken),
      verifyToken: mask(config.verifyToken),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
  }

  const body = await req.json();
  const existing =
    (await prisma.whatsAppConfig.findUnique({ where: { restaurantId } })) ||
    (await prisma.whatsAppConfig.create({ data: { restaurantId } }));

  const data: any = {};
  const maskRx = /^••••••/;

  if (body.phoneNumberId !== undefined) data.phoneNumberId = body.phoneNumberId || null;
  if (body.businessAccountId !== undefined) data.businessAccountId = body.businessAccountId || null;
  if (body.displayPhoneNumber !== undefined) data.displayPhoneNumber = body.displayPhoneNumber || null;
  if (body.accessToken !== undefined && !maskRx.test(body.accessToken)) {
    data.accessToken = body.accessToken || null;
  }
  if (body.verifyToken !== undefined && !maskRx.test(body.verifyToken)) {
    data.verifyToken = body.verifyToken || null;
  }
  if (body.greeting !== undefined) data.greeting = body.greeting || null;
  if (body.businessHours !== undefined) data.businessHours = body.businessHours || null;
  if (body.outsideHoursMessage !== undefined) data.outsideHoursMessage = body.outsideHoursMessage || null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.whatsAppConfig.update({
    where: { id: existing.id },
      restaurantId,
  });

  return NextResponse.json({
    config: {
      ...updated,
      accessToken: mask(updated.accessToken),
      verifyToken: mask(updated.verifyToken),
    },
  });
}
