// Public delivery order endpoint - no auth required
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function generateOrderNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `DLV-${datePart}-${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      restaurantId,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      deliveryNeighborhood,
      deliveryCity,
      deliveryZipCode,
      deliveryComplement,
      deliveryReference,
      items,
      specialInstructions,
      deliveryFee = 0,
    } = body;

    if (!restaurantId || !customerName || !customerPhone || !deliveryAddress || !items?.length) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: restaurantId, customerName, customerPhone, deliveryAddress, items' },
        { status: 400 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
    }

    // Resolve menu items and compute totals (scoped to this restaurant - a
    // client could otherwise mix in another restaurant's menuItemIds/prices)
    const menuItemIds = items.map((i: any) => i.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId, active: true, available: true },
      include: { images: { take: 1 } },
    });

    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    const unknownItems = items.filter((item: any) => !menuMap.has(item.menuItemId));
    if (unknownItems.length > 0) {
      return NextResponse.json(
        { error: 'Um ou mais itens do pedido não foram encontrados no cardápio deste restaurante' },
        { status: 400 }
      );
    }

    // OrderItem.recipeId is required (no menuItemId fallback on that model),
    // so any requested menu item without a linked recipe cannot become a
    // kitchen-visible line item. Silently dropping it would still charge the
    // customer for something the kitchen never sees - refuse instead.
    const unlinkedItems = items.filter((item: any) => {
      const mi = menuMap.get(item.menuItemId);
      return mi && !mi.recipeId;
    });
    if (unlinkedItems.length > 0) {
      const names = unlinkedItems.map((item: any) => menuMap.get(item.menuItemId)?.name).filter(Boolean);
      return NextResponse.json(
        { error: `Itens sem receita vinculada não podem ser pedidos ainda: ${names.join(', ')}. Peça ao restaurante para vincular uma receita a esses itens do cardápio.` },
        { status: 422 }
      );
    }

    let subtotal = 0;
    const orderItems: { recipeId: string; quantity: number; specialInstructions?: string }[] = [];

    for (const item of items) {
      const mi = menuMap.get(item.menuItemId);
      if (!mi || !mi.recipeId) continue;
      const price = Number(mi.price);
      subtotal += price * (item.quantity || 1);
      orderItems.push({
        recipeId: mi.recipeId,
        quantity: item.quantity || 1,
        specialInstructions: item.specialInstructions || undefined,
      });
    }

    const total = subtotal + Number(deliveryFee);
    const orderNumber = generateOrderNumber();

    // Find or create customer, scoped to this restaurant. Customer.email is
    // globally unique (not per-restaurant), so if this email already belongs
    // to a customer at a different restaurant, skip linking a Customer to
    // this order rather than misattributing someone else's CRM record or
    // crashing on the unique constraint.
    let customer = null;
    if (customerEmail) {
      customer = await prisma.customer.findFirst({ where: { email: customerEmail, restaurantId } });
      if (!customer) {
        const emailTakenElsewhere = await prisma.customer.findUnique({ where: { email: customerEmail } });
        if (!emailTakenElsewhere) {
          customer = await prisma.customer.create({
            data: {
              restaurantId,
              name: customerName,
              email: customerEmail,
              phone: customerPhone,
              address: deliveryAddress,
              city: deliveryCity || '',
              zipCode: deliveryZipCode || '',
            },
          });
        }
      }
    }

    const order = await prisma.order.create({
      data: {
        restaurantId,
        orderNumber,
        orderType: 'DELIVERY',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalItems: orderItems.reduce((acc, i) => acc + i.quantity, 0),
        subtotal,
        fees: Number(deliveryFee),
        total,
        specialInstructions: [
          specialInstructions,
          `Endereço: ${deliveryAddress}${deliveryComplement ? ', ' + deliveryComplement : ''}`,
          deliveryNeighborhood ? `Bairro: ${deliveryNeighborhood}` : '',
          deliveryCity ? `Cidade: ${deliveryCity}` : '',
          deliveryZipCode ? `CEP: ${deliveryZipCode}` : '',
          deliveryReference ? `Referência: ${deliveryReference}` : '',
          `Cliente: ${customerName} - ${customerPhone}`,
        ].filter(Boolean).join('\n'),
        customerId: customer?.id || undefined,
        items: {
          create: orderItems.map((oi) => ({
            recipeId: oi.recipeId,
            quantity: oi.quantity,
            specialInstructions: oi.specialInstructions,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total: Number(order.total),
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.fees),
        status: order.status,
        itemCount: order.totalItems,
      },
    });
  } catch (error: any) {
    console.error('Error creating delivery order:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Conflito ao criar pedido, tente novamente' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 });
  }
}
