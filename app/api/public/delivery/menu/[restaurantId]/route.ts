// Public delivery menu endpoint - no auth required
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDeliveryPaymentOptions } from '@/lib/delivery-payments/settings-service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        businessHours: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
    }

    const categories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId: params.restaurantId },
      include: {
        items: {
          where: { active: true, available: true, displayOnWeb: true },
          include: {
            images: { where: { isPublic: true }, take: 1 },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    const filteredCategories = categories.filter((c) => c.items.length > 0);
    const paymentOptions = await getDeliveryPaymentOptions(params.restaurantId);
    // Kept for older clients: true when the restaurant can take PIX/card online.
    const acceptsOnlinePayment = paymentOptions.online.pix;

    return NextResponse.json(
      { restaurant: { ...restaurant, acceptsOnlinePayment, paymentOptions }, categories: filteredCategories },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error) {
    console.error('Error fetching delivery menu:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
