// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import QRCode from 'qrcode';

async function getRestaurantId(session: any) {
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { restaurants: { include: { restaurant: true }, take: 1 } },
  });
  return user?.currentRestaurantId || user?.restaurants?.[0]?.restaurantId || null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const restaurantId = await getRestaurantId(session);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        packagingQrEnabled: true,
        packagingQrDiscount: true,
        packagingQrMessage: true,
      },
    });

    // Get scan stats
    const totalScans = await prisma.packagingQRScan.count({
      where: { restaurantId },
    });
    const totalConverted = await prisma.packagingQRScan.count({
      where: { restaurantId, converted: true },
    });
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const recentScans = await prisma.packagingQRScan.count({
      where: { restaurantId, scannedAt: { gte: last30Days } },
    });
    const recentConverted = await prisma.packagingQRScan.count({
      where: { restaurantId, converted: true, scannedAt: { gte: last30Days } },
    });

    // Generate QR code data URL
    const baseUrl = process.env.NEXTAUTH_URL || 'https://gastrux.com';
    const qrUrl = `${baseUrl}/pedido-direto/${restaurantId}?src=qr_packaging`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return NextResponse.json({
      config: restaurant,
      stats: {
        totalScans,
        totalConverted,
        conversionRate: totalScans > 0 ? ((totalConverted / totalScans) * 100).toFixed(1) : '0.0',
        recentScans,
        recentConverted,
        recentConversionRate: recentScans > 0 ? ((recentConverted / recentScans) * 100).toFixed(1) : '0.0',
      },
      qrDataUrl,
      qrUrl,
    });
  } catch (error) {
    console.error('QR Embalagem GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const restaurantId = await getRestaurantId(session);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const body = await req.json();
    const { packagingQrEnabled, packagingQrDiscount, packagingQrMessage } = body;

    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(packagingQrEnabled !== undefined && { packagingQrEnabled }),
        ...(packagingQrDiscount !== undefined && { packagingQrDiscount: parseInt(packagingQrDiscount) }),
        ...(packagingQrMessage !== undefined && { packagingQrMessage }),
      },
      select: {
        packagingQrEnabled: true,
        packagingQrDiscount: true,
        packagingQrMessage: true,
      },
    });

    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error('QR Embalagem PUT error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
