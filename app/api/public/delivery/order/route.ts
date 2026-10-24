// Public delivery order endpoint - no auth required
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ORDER_REFUSAL, restaurantAcceptsOrders } from '@/lib/billing/order-gate';
import { ensureMenuItemRecipes } from '@/lib/cardapio/product-recipe';
import { noteSalesThresholds } from '@/lib/plans/monthly-sales';
import { getDeliveryPaymentOptions } from '@/lib/delivery-payments/settings-service';
import { validatePaymentChoice, describePaymentForKitchen } from '@/lib/delivery-payments/choice';
import { normalizeQuantity, sanitizeCustomerNote, singleLine } from '@/lib/delivery-payments/order-input';
import { formatPhone, normalizePhone } from '@/lib/cashback/rules';
import { findCustomerByPhone } from '@/lib/cashback/service';
import { ownIntegration } from '@/lib/delivery-orders/integrations';

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
      paymentMethod,
      changeFor,
      voucherBrand,
      pickup,
    } = body;
    // "Retirar no local" (owner request 2026-10-23): the customer picks the order up, no address and no delivery fee
    const isPickup = pickup === true;

    if (!restaurantId || !customerName || !customerPhone || (!deliveryAddress && !isPickup) || !items?.length) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: restaurantId, customerName, customerPhone, deliveryAddress (ou pickup), items' },
        { status: 400 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
    }
    // Plans of 2026-10-18: no new customer orders while the plan is locked
    if (!(await restaurantAcceptsOrders(restaurantId))) return NextResponse.json(ORDER_REFUSAL, { status: 403 });


    // Resolve menu items and compute totals (scoped to this restaurant - a
    // client could otherwise mix in another restaurant's menuItemIds/prices)
    const menuItemIds = items.map((i: any) => i.menuItemId);
    // Items without a ficha técnica get their ficha simples first (2026-10-12)
    await ensureMenuItemRecipes(prisma, restaurantId, menuItemIds.filter((id: unknown) => typeof id === 'string'), { onSaleOnly: true });
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

    // Safety net after the ficha simples above: OrderItem.recipeId is required (no menuItemId fallback),
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
      // One normalized integer feeds the subtotal, the OrderItem and totalItems.
      const quantity = normalizeQuantity(item.quantity);
      subtotal += price * quantity;
      orderItems.push({
        recipeId: mi.recipeId,
        quantity,
        specialInstructions: item.specialInstructions || undefined,
      });
    }

    // deliveryFee has no server-side source of truth to validate against
    // (no delivery zone/fee config exists yet) - clamp it to non-negative
    // so a client can't submit a negative value to reduce the order total.
    const safeDeliveryFee = isPickup ? 0 : Math.max(0, Number(deliveryFee) || 0);
    const total = subtotal + safeDeliveryFee;

    // The payment choice is validated on the server against what this restaurant
    // offers (its settings and its Mercado Pago connection) and against the
    // server-computed total; nothing the browser says about availability is trusted.
    const paymentOptions = await getDeliveryPaymentOptions(restaurantId);
    const choiceResult = validatePaymentChoice(paymentOptions, { paymentMethod, changeFor, voucherBrand }, total);
    if (!choiceResult.ok) {
      return NextResponse.json({ error: choiceResult.error }, { status: 400 });
    }
    const choice = choiceResult.choice;
    const deliveryNote = describePaymentForKitchen(choice, total);
    const paymentNote = isPickup ? deliveryNote.replace(/^Pagamento na entrega:/, 'Pagamento na retirada:') : deliveryNote;

    const orderNumber = generateOrderNumber();

    // The customer of this restaurant by phone (cashback and CRM, spec 2026-10-23 §7.3); the e-mail is optional
    // and globally unique, so it is saved only when no other customer has it. Without a valid phone, by e-mail.
    let customer = null;
    const phoneDigits = normalizePhone(customerPhone);
    const emailFree = async () => !customerEmail || !(await prisma.customer.findUnique({ where: { email: customerEmail } }));
    if (phoneDigits) {
      customer = await findCustomerByPhone(prisma, restaurantId, phoneDigits);
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            restaurantId, name: customerName, phone: formatPhone(phoneDigits), phoneDigits,
            email: (await emailFree()) ? customerEmail || null : null,
            address: isPickup ? '' : deliveryAddress, city: deliveryCity || '', zipCode: deliveryZipCode || '',
          },
        });
      } else if (!customer.email && customerEmail && (await emailFree())) {
        customer = await prisma.customer.update({ where: { id: customer.id }, data: { email: customerEmail } });
      }
    } else if (customerEmail) {
      customer = await prisma.customer.findFirst({ where: { email: customerEmail, restaurantId } });
    }

    // Customer-supplied text that goes into the order note: each value is collapsed to one
    // line (line breaks of any kind become " / "), so none of it can start a line of the note.
    // Empty values are skipped, so no dangling label or ", ".
    const noteComplement = singleLine(deliveryComplement);
    const noteNeighborhood = singleLine(deliveryNeighborhood);
    const noteCity = singleLine(deliveryCity);
    const noteZipCode = singleLine(deliveryZipCode);
    const noteReference = singleLine(deliveryReference);
    // Only the server may write a line that starts with "Pagamento": every customer-supplied
    // value is one line that begins with a fixed label (structural, not a word filter).
    const kitchenNote = [
      isPickup ? 'RETIRADA NO LOCAL' : '',
      sanitizeCustomerNote(specialInstructions),
      isPickup ? '' : `Endereço: ${singleLine(deliveryAddress)}${noteComplement ? ', ' + noteComplement : ''}`,
      !isPickup && noteNeighborhood ? `Bairro: ${noteNeighborhood}` : '',
      !isPickup && noteCity ? `Cidade: ${noteCity}` : '',
      !isPickup && noteZipCode ? `CEP: ${noteZipCode}` : '',
      !isPickup && noteReference ? `Referência: ${noteReference}` : '',
      paymentNote,
      `Cliente: ${singleLine(customerName)} - ${singleLine(customerPhone)}`,
    ].filter(Boolean).join('\n');

    // The digital menu in the order pipeline (plan 2026-10-23 api-de-pedidos, Task 4b): the order is also an
    // ExternalOrder of the restaurant's "Cardápio digital", so it shows in Pedidos de delivery with its values and
    // its status. It is always accepted: an online payment attaches to the kitchen order created right below
    const site = await ownIntegration(restaurantId, 'delivery_site');
    const externalOrder = await prisma.externalOrder.create({
      data: {
        restaurantId, integrationId: site.id, externalOrderId: orderNumber, status: 'CONFIRMED',
        totalAmount: total, subtotal, deliveryFee: safeDeliveryFee, discount: 0, platformFee: 0,
        paymentMethod: choice.paymentMethod, paidOnline: false, customerId: customer?.id ?? null,
        customerName: singleLine(customerName), customerPhone: phoneDigits ? formatPhone(phoneDigits) : singleLine(customerPhone),
        customerEmail: customerEmail || null,
        deliveryAddress: isPickup ? 'Retirada no local' : singleLine(deliveryAddress), deliveryCity: deliveryCity || null, deliveryZipcode: deliveryZipCode || null,
        items: JSON.stringify(orderItems.map((oi) => ({ name: menuItems.find((m) => m.recipeId === oi.recipeId)?.name, quantity: oi.quantity }))),
        specialInstructions: kitchenNote,
      },
      select: { id: true },
    });

    let order;
    try {
      order = await prisma.order.create({
        data: {
          restaurantId,
          orderNumber,
          orderType: 'DELIVERY',
          status: 'PENDING',
          paymentStatus: 'PENDING',
          totalItems: orderItems.reduce((acc, i) => acc + i.quantity, 0),
          subtotal,
          fees: safeDeliveryFee,
          total,
          paymentMethod: choice.paymentMethod,
          cashChangeFor: choice.changeFor,
          voucherBrand: choice.voucherBrand,
          // Only the server may write a line that starts with "Pagamento": every customer-supplied
          // value is one line that begins with a fixed label (structural, not a word filter).
          specialInstructions: kitchenNote,
          customerId: customer?.id || undefined,
          externalOrderId: externalOrder.id,
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
    } catch (error) {
      // No kitchen order: the pipeline entry must not stay behind as a confirmed order without one
      await prisma.externalOrder.delete({ where: { id: externalOrder.id } }).catch(() => {});
      throw error;
    }
    await prisma.externalOrder.update({ where: { id: externalOrder.id }, data: { internalOrderId: order.id } });

    // The plan counts sales per month and only warns (owner decision 2026-10-09)
    await noteSalesThresholds(restaurantId);

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
        paymentMethod: choice.paymentMethod,
        paymentSummary: paymentNote,
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
