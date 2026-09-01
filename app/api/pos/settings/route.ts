// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET: Retrieve POS settings
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const settings = await prisma.pOSSettings.findFirst({ where: { restaurantId } });
    if (!settings) {
      return NextResponse.json(
        { error: 'POS not configured' },
        { status: 404 }
      );
    }

    // Don't expose sensitive tokens
    return NextResponse.json({
      id: settings.id,
      provider: settings.provider,
      isConfigured: settings.isConfigured,
      squareLocationId: settings.squareLocationId,
      squareMerchantId: settings.squareMerchantId,
      sumupMerchantId: settings.sumupMerchantId,
    });
  } catch (error) {
    console.error('POS GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch POS settings' },
      { status: 500 }
    );
  }
}

// POST/PUT: Configure POS settings
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owner can configure POS' },
        { status: 403 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const body = await req.json();
    const {
      provider,
      squareAccessToken,
      squareLocationId,
      squareMerchantId,
      sumupApiKey,
      sumupMerchantId,
    } = body;

    // Find or create settings, scoped to this restaurant - an unscoped
    // lookup here would silently overwrite a different restaurant's live
    // payment provider credentials.
    let settings = await prisma.pOSSettings.findFirst({ where: { restaurantId } });

    if (!settings) {
      settings = await prisma.pOSSettings.create({
        data: {
          restaurantId,
          provider: provider || 'SQUARE',
          isConfigured: true,
          squareAccessToken,
          squareLocationId,
          squareMerchantId,
          sumupApiKey,
          sumupMerchantId,
        },
      });
    } else {
      settings = await prisma.pOSSettings.update({
        where: { id: settings.id },
        data: {
          provider: provider || settings.provider,
          isConfigured: true,
          squareAccessToken: squareAccessToken || settings.squareAccessToken,
          squareLocationId: squareLocationId || settings.squareLocationId,
          squareMerchantId: squareMerchantId || settings.squareMerchantId,
          sumupApiKey: sumupApiKey || settings.sumupApiKey,
          sumupMerchantId: sumupMerchantId || settings.sumupMerchantId,
        },
      });
    }

    return NextResponse.json(
      { success: true, message: 'POS configured successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('POS POST error:', error);
    return NextResponse.json(
      { error: 'Failed to configure POS' },
      { status: 500 }
    );
  }
}
