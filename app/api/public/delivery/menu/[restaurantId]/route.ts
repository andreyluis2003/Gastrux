// Public delivery menu endpoint - no auth required
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stateOf } from '@/lib/orders/store-open';
import { offeredToday } from '@/lib/cardapio/days-server';
import { getDeliveryPaymentOptions } from '@/lib/delivery-payments/settings-service';
import { closedWeeklyMenu, openWeeklyMenu } from '@/lib/weekly-menu/public';

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
        ordersClosedAt: true,
        timezone: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
    }

    // Cardápio da semana (spec 2026-11-10 cardapio-da-semana): while one is open the link sells only its products,
    // whatever their weekdays or 'available' flag; 'active' and 'displayOnWeb' still count
    const weekly = await openWeeklyMenu(params.restaurantId);

    // Only what the ordering page shows (app/delivery/[restaurantId]/page.tsx): the whole rows used
    // to go out, with the recipe link and internal flags (isolation sweep, 2026-10-07)
    const categories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId: params.restaurantId },
      select: {
        id: true,
        name: true,
        emoji: true,
        items: {
          where: weekly
            ? { active: true, displayOnWeb: true, soldByWeight: false, id: { in: [...weekly.items.keys()] } }
            : { active: true, available: true, displayOnWeb: true, soldByWeight: false, ...(await offeredToday(params.restaurantId)) },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            available: true,
            images: { where: { isPublic: true }, take: 1, select: { id: true, imageUrl: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    const filteredCategories = categories
      .filter((c) => c.items.length > 0)
      .map((c) => (weekly ? { ...c, items: c.items.map((i) => ({ ...i, soldOut: weekly.items.get(i.id)?.remaining === 0 })) } : c));
    const { ordersClosedAt, timezone, ...publicInfo } = restaurant;
    // Closed by hand or by the hours (spec 2026-11-08 loja-pelo-horario)
    const store = stateOf({ ordersClosedAt, businessHours: restaurant.businessHours, timezone });
    const paymentOptions = await getDeliveryPaymentOptions(params.restaurantId);
    // Kept for older clients: true when the restaurant can take PIX/card online.
    // A pre-order is paid on delivery or pickup: no online payment yet (spec 2026-11-10 cardapio-da-semana, "Depois")
    if (weekly) paymentOptions.online = { pix: false, card: false };
    const acceptsOnlinePayment = paymentOptions.online.pix;
    // With a weekly menu open only a closing by hand stops the link (the order is for another day)
    const closed = weekly ? store.reason === 'manual' : store.closed;
    const weeklyMenuClosed = weekly ? null : await closedWeeklyMenu(params.restaurantId);
    const weeklyMenu = weekly ? { id: weekly.id, serviceDate: weekly.serviceDate, banner: weekly.banner } : null;

    return NextResponse.json(
      // Loja fechada shows on the page (spec 2026-11-07 quadro-de-pedidos); a short cache so closing shows soon
      { restaurant: { ...publicInfo, closed, opens: closed ? store.opens : null, acceptsOnlinePayment, paymentOptions, weeklyMenu, weeklyMenuClosed }, categories: filteredCategories },
      { headers: { 'Cache-Control': 'public, max-age=15' } }
    );
  } catch (error) {
    console.error('Error fetching delivery menu:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
