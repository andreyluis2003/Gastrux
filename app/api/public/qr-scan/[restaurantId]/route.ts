// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const { restaurantId } = params;
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const src = req.nextUrl.searchParams.get('src') || 'qr_packaging';

    // Record the scan
    await prisma.packagingQRScan.create({
      data: {
        source: src,
        ipAddress: ip.split(',')[0].trim(),
        userAgent: userAgent.substring(0, 255),
      },
    });

    // Redirect to the direct ordering landing page
    const baseUrl = process.env.NEXTAUTH_URL || 'https://gastrux.com';
    return NextResponse.redirect(`${baseUrl}/pedido-direto/${restaurantId}?src=${src}`);
  } catch (error) {
    console.error('QR Scan tracking error:', error);
    // Even on error, redirect to delivery page
    const baseUrl = process.env.NEXTAUTH_URL || 'https://gastrux.com';
    return NextResponse.redirect(`${baseUrl}/delivery/${params.restaurantId}`);
  }
}
