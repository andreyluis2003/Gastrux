// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        dailySummaryEnabled: true,
        dailySummaryHour: true,
        dailySummaryPhone: true,
        alertsWhatsappEnabled: true,
        alertsEmailEnabled: true,
      },
    });

    return NextResponse.json({
      dailySummaryEnabled: restaurant?.dailySummaryEnabled || false,
      dailySummaryHour: restaurant?.dailySummaryHour || 22,
      dailySummaryPhone: restaurant?.dailySummaryPhone || '',
      alertsWhatsappEnabled: restaurant?.alertsWhatsappEnabled || false,
      alertsEmailEnabled: restaurant?.alertsEmailEnabled ?? true,
    });
  } catch (error: any) {
    console.error('[ai-config GET] Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const body = await req.json();
    const {
      dailySummaryEnabled,
      dailySummaryHour,
      dailySummaryPhone,
      alertsWhatsappEnabled,
      alertsEmailEnabled,
    } = body;

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        dailySummaryEnabled: Boolean(dailySummaryEnabled),
        dailySummaryHour: Math.max(0, Math.min(23, parseInt(dailySummaryHour) || 22)),
        dailySummaryPhone: dailySummaryPhone || null,
        alertsWhatsappEnabled: Boolean(alertsWhatsappEnabled),
        alertsEmailEnabled: Boolean(alertsEmailEnabled),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ai-config PUT] Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
