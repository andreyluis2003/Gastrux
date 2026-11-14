// Public delivery order endpoint - no auth required
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CLOSED_MESSAGE, isStoreClosed, storeState } from '@/lib/orders/store-open';
import { offeredToday } from '@/lib/cardapio/days-server';
import { ORDER_REFUSAL, restaurantAcceptsOrders } from '@/lib/billing/order-gate';
import { ensureMenuItemRecipes } from '@/lib/cardapio/product-recipe';
import { noteSalesThresholds } from '@/lib/plans/monthly-sales';
import { getDeliveryPaymentOptions } from '@/lib/delivery-payments/settings-service';
import { validatePaymentChoice, describePaymentForKitchen, type DeliveryPaymentOptions } from '@/lib/delivery-payments/choice';
import { normalizeQuantity, sanitizeCustomerNote, singleLine } from '@/lib/delivery-payments/order-input';
import { formatPhone, normalizePhone } from '@/lib/cashback/rules';
import { findCustomerByPhone } from '@/lib/cashback/service';
import { attachRedemption, checkCoupon, releaseRedemption, reserveCoupon } from '@/lib/coupons/service';
import { clientAddress, takeCouponTry } from '@/lib/coupons/attempts';
import { writeSiteOrder } from '@/lib/delivery-site/write-order';
import { CashRuleError } from '@/lib/caixa/rules';
import { ITEMS_NOT_FOUND, checkWeeklyOrder, placeWeeklyOrder, type WeeklyOrderLine } from '@/lib/weekly-menu/public';

export const dynamic = 'force-dynamic';

function generateOrderNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `DLV-${datePart}-${rand}`;
}

// Steps shared by the order for now and the weekly pre-order (spec 2026-11-10 cardapio-da-semana)

type Refusal = { refused: NextResponse };
type ReservedCoupon = { redemptionId: string; code: string; discountCents: number };

const money = (n: number) => Math.round(n * 100) / 100;

/** The coupon checked (rate-limited) before anything is written: its discount now, or the refusal */
async function previewCoupon(
  req: NextRequest, restaurantId: string, couponCode: string, couponPhone: string, subtotal: number, fee: number,
): Promise<Refusal | { discount: number }> {
  // The same limit as the preview: the order route must not be a way to try codes (security review 2026-11-08)
  if (!takeCouponTry(clientAddress(req.headers), restaurantId)) {
    return { refused: NextResponse.json({ error: 'Muitas tentativas de cupom. Espere um minuto.', code: 'COUPON_REFUSED' }, { status: 429 }) };
  }
  const preview = await checkCoupon(restaurantId, couponCode, couponPhone, Math.round(subtotal * 100), Math.round(fee * 100));
  if (!preview.ok) return { refused: NextResponse.json({ error: preview.error, code: 'COUPON_REFUSED' }, { status: 400 }) };
  return { discount: preview.discountCents / 100 };
}

/** One use of the coupon, reserved under a lock (the limits are counted again) */
async function reserveOrderCoupon(
  restaurantId: string, couponCode: string, couponPhone: string, subtotal: number, fee: number,
): Promise<Refusal | { coupon: ReservedCoupon }> {
  const r = await reserveCoupon(restaurantId, couponCode, couponPhone, Math.round(subtotal * 100), Math.round(fee * 100));
  if (!r.ok) return { refused: NextResponse.json({ error: r.error, code: 'COUPON_REFUSED' }, { status: 409 }) };
  return { coupon: r };
}

/**
 * The payment choice is validated on the server against what this restaurant
 * offers (its settings and its Mercado Pago connection) and against the
 * server-computed total; nothing the browser says about availability is trusted.
 */
function choosePayment(options: DeliveryPaymentOptions, body: any, total: number, isPickup: boolean) {
  const { paymentMethod, changeFor, voucherBrand } = body;
  const choiceResult = validatePaymentChoice(options, { paymentMethod, changeFor, voucherBrand }, total);
  if (!choiceResult.ok) return { refused: NextResponse.json({ error: choiceResult.error }, { status: 400 }) };
  const choice = choiceResult.choice;
  const deliveryNote = describePaymentForKitchen(choice, total);
  const paymentNote = isPickup ? deliveryNote.replace(/^Pagamento na entrega:/, 'Pagamento na retirada:') : deliveryNote;
  return { choice, paymentNote };
}

/**
 * The customer of this restaurant by phone (cashback and CRM, spec 2026-10-23 §7.3); the e-mail is optional
 * and globally unique, so it is saved only when no other customer has it. Without a valid phone, by e-mail.
 */
async function findOrCreateCustomer(restaurantId: string, body: any, isPickup: boolean) {
  const { customerName, customerPhone, customerEmail, deliveryAddress, deliveryCity, deliveryZipCode } = body;
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
  return customer;
}

function kitchenNoteOf(body: any, isPickup: boolean, paymentNote: string, coupon: ReservedCoupon | null): string {
  const {
    customerName, customerPhone, deliveryAddress, deliveryNeighborhood, deliveryCity, deliveryZipCode,
    deliveryComplement, deliveryReference, specialInstructions,
  } = body;
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
  return [
    isPickup ? 'RETIRADA NO LOCAL' : '',
    sanitizeCustomerNote(specialInstructions),
    isPickup ? '' : `Endereço: ${singleLine(deliveryAddress)}${noteComplement ? ', ' + noteComplement : ''}`,
    !isPickup && noteNeighborhood ? `Bairro: ${noteNeighborhood}` : '',
    !isPickup && noteCity ? `Cidade: ${noteCity}` : '',
    !isPickup && noteZipCode ? `CEP: ${noteZipCode}` : '',
    !isPickup && noteReference ? `Referência: ${noteReference}` : '',
    paymentNote,
    coupon ? `Cupom ${coupon.code}: -${(coupon.discountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '',
    `Cliente: ${singleLine(customerName)} - ${singleLine(customerPhone)}`,
  ].filter(Boolean).join('\n');
}

/**
 * Pre-order on the weekly menu (spec 2026-11-10 cardapio-da-semana): the same customer, payment and coupon checks
 * as an order for now, but nothing reaches the kitchen yet: a WeeklyMenuOrder keeps all a later release needs.
 */
async function postWeeklyOrder(req: NextRequest, body: any, isPickup: boolean, restaurantFee: number) {
  const { restaurantId, weeklyMenuId, customerName, customerPhone, customerEmail, deliveryAddress, deliveryCity, deliveryZipCode, items, couponCode } = body;
  try {
    // The order is for another day: closed by the hours takes it, closed by hand does not
    if ((await storeState(restaurantId)).reason === 'manual') {
      return NextResponse.json({ error: CLOSED_MESSAGE, code: 'STORE_CLOSED' }, { status: 409 });
    }
    if (!Array.isArray(items)) return NextResponse.json({ error: ITEMS_NOT_FOUND }, { status: 400 });
    const lines = items.map((i: any) => ({
      menuItemId: typeof i?.menuItemId === 'string' ? i.menuItemId : '',
      quantity: normalizeQuantity(i?.quantity),
      specialInstructions: i?.specialInstructions || null,
    }));
    // Early answer on the menu, the products and the portions; checked again under the menu lock when written
    await checkWeeklyOrder(prisma, restaurantId, weeklyMenuId, lines);

    // The menu's products sell whatever their weekdays or 'available' flag; a removed one does not
    const ids = [...new Set(lines.map((l) => l.menuItemId))];
    const where = { id: { in: ids }, restaurantId, active: true, soldByWeight: false };
    const select = { id: true, name: true, price: true, recipeId: true } as const;
    let found = await prisma.menuItem.findMany({ where, select });
    if (found.length !== ids.length) return NextResponse.json({ error: ITEMS_NOT_FOUND }, { status: 400 });
    // Items without a ficha técnica get their ficha simples, as an order for now does (2026-10-12)
    const unlinked = found.filter((m) => !m.recipeId).map((m) => m.id);
    if (unlinked.length) {
      await ensureMenuItemRecipes(prisma, restaurantId, unlinked);
      found = await prisma.menuItem.findMany({ where, select });
    }
    const byId = new Map(found.map((m) => [m.id, m]));
    const missing = found.filter((m) => !m.recipeId).map((m) => m.name);
    if (missing.length) {
      return NextResponse.json(
        { error: `Itens sem receita vinculada não podem ser pedidos ainda: ${missing.join(', ')}. Peça ao restaurante para vincular uma receita a esses itens do cardápio.` },
        { status: 422 }
      );
    }

    let subtotal = 0;
    const orderLines: WeeklyOrderLine[] = lines.map((l) => {
      const mi = byId.get(l.menuItemId)!;
      // Price frozen on the pre-order
      const unitPrice = Number(mi.price);
      subtotal += unitPrice * l.quantity;
      return { menuItemId: mi.id, recipeId: mi.recipeId!, name: mi.name, unitPrice, quantity: l.quantity, specialInstructions: l.specialInstructions };
    });

    const safeDeliveryFee = isPickup ? 0 : restaurantFee;
    const hasCoupon = typeof couponCode === 'string' && couponCode.trim() !== '';
    const couponPhone = normalizePhone(customerPhone) || '';
    let couponDiscount = 0;
    if (hasCoupon) {
      const preview = await previewCoupon(req, restaurantId, couponCode, couponPhone, subtotal, safeDeliveryFee);
      if ('refused' in preview) return preview.refused;
      couponDiscount = preview.discount;
    }
    let total = Math.round((subtotal + safeDeliveryFee - couponDiscount) * 100) / 100;

    // Paid on delivery or pickup: no online payment on a pre-order yet (spec 2026-11-10 cardapio-da-semana, "Depois")
    const paymentOptions = await getDeliveryPaymentOptions(restaurantId);
    const payment = choosePayment({ ...paymentOptions, online: { pix: false, card: false } }, body, total, isPickup);
    if ('refused' in payment) return payment.refused;
    const { choice, paymentNote } = payment;

    const orderNumber = generateOrderNumber();

    // Reserved now and kept on the pre-order (linked to the ExternalOrder at release); released if nothing is written
    let coupon: ReservedCoupon | null = null;
    if (hasCoupon) {
      const r = await reserveOrderCoupon(restaurantId, couponCode, couponPhone, subtotal, safeDeliveryFee);
      if ('refused' in r) return r.refused;
      coupon = r.coupon;
      couponDiscount = coupon.discountCents / 100;
      total = Math.round((subtotal + safeDeliveryFee - couponDiscount) * 100) / 100;
    }
    try {
      const customer = await findOrCreateCustomer(restaurantId, body, isPickup);
      const phoneDigits = normalizePhone(customerPhone);
      const placed = await placeWeeklyOrder(restaurantId, weeklyMenuId, {
        orderNumber, customerId: customer?.id ?? null,
        customerName: singleLine(customerName), customerPhone: phoneDigits ? formatPhone(phoneDigits) : singleLine(customerPhone),
        customerEmail: customerEmail || null, isPickup,
        deliveryAddress: isPickup ? null : singleLine(deliveryAddress), deliveryCity: deliveryCity || null, deliveryZipCode: deliveryZipCode || null,
        kitchenNote: kitchenNoteOf(body, isPickup, paymentNote, coupon),
        // The same sanitized text the kitchen note carries, without its label, for "O que fazer"
        customerNote: sanitizeCustomerNote(body.specialInstructions).replace(/^Obs\. do cliente: /, '') || null,
        paymentMethod: choice.paymentMethod, cashChangeFor: choice.changeFor, voucherBrand: choice.voucherBrand, paymentNote,
        subtotal: money(subtotal), deliveryFee: money(safeDeliveryFee), discount: couponDiscount, total: money(total),
        couponRedemptionId: coupon?.redemptionId ?? null, couponCode: coupon?.code ?? null,
        items: orderLines,
      });
      return NextResponse.json({
        success: true,
        order: {
          id: placed.id,
          orderNumber,
          total: money(total),
          subtotal: money(subtotal),
          deliveryFee: money(safeDeliveryFee),
          status: 'ENCOMENDA',
          serviceDate: placed.serviceDate,
          itemCount: orderLines.reduce((acc, i) => acc + i.quantity, 0),
          paymentMethod: choice.paymentMethod,
          paymentSummary: paymentNote,
          discount: couponDiscount,
          coupon: coupon?.code ?? null,
        },
      });
    } catch (error) {
      // No pre-order came out: the coupon use goes back
      if (coupon) await releaseRedemption(coupon.redemptionId).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof CashRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
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
      deliveryCity,
      deliveryZipCode,
      items,
      pickup,
      couponCode,
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
    // Cardápio da semana: a pre-order for a later day (spec 2026-11-10 cardapio-da-semana)
    if (typeof body.weeklyMenuId === 'string' && body.weeklyMenuId) return await postWeeklyOrder(req, body, isPickup, restaurant.deliveryFee);
    // Loja fechada (spec 2026-11-07 quadro-de-pedidos)
    if (await isStoreClosed(restaurantId)) return NextResponse.json({ error: CLOSED_MESSAGE, code: 'STORE_CLOSED' }, { status: 409 });


    // Resolve menu items and compute totals (scoped to this restaurant - a
    // client could otherwise mix in another restaurant's menuItemIds/prices)
    const menuItemIds = items.map((i: any) => i.menuItemId);
    // Items without a ficha técnica get their ficha simples first (2026-10-12)
    await ensureMenuItemRecipes(prisma, restaurantId, menuItemIds.filter((id: unknown) => typeof id === 'string'), { onSaleOnly: true });
    const menuItems = await prisma.menuItem.findMany({
      // An old cart cannot buy an item out of its weekdays (spec 2026-11-06 cardapio-rapido)
      where: { id: { in: menuItemIds }, restaurantId, active: true, available: true, soldByWeight: false, ...(await offeredToday(restaurantId)) },
      include: { images: { take: 1 } },
    });

    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    const unknownItems = items.filter((item: any) => !menuMap.has(item.menuItemId));
    if (unknownItems.length > 0) {
      return NextResponse.json({ error: ITEMS_NOT_FOUND }, { status: 400 });
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
    const orderItems: { recipeId: string; name: string; quantity: number; specialInstructions?: string }[] = [];

    for (const item of items) {
      const mi = menuMap.get(item.menuItemId);
      if (!mi || !mi.recipeId) continue;
      const price = Number(mi.price);
      // One normalized integer feeds the subtotal, the OrderItem and totalItems.
      const quantity = normalizeQuantity(item.quantity);
      subtotal += price * quantity;
      orderItems.push({
        recipeId: mi.recipeId,
        name: mi.name,
        quantity,
        specialInstructions: item.specialInstructions || undefined,
      });
    }

    // The restaurant's own fee (owner request 2026-11-14): the deliveryFee the page sends is ignored
    const safeDeliveryFee = isPickup ? 0 : restaurant.deliveryFee;
    // Cupom (spec 2026-11-08 cupons): checked here, reserved right before the order is written
    const hasCoupon = typeof couponCode === 'string' && couponCode.trim() !== '';
    const couponPhone = normalizePhone(customerPhone) || '';
    let couponDiscount = 0;
    if (hasCoupon) {
      const preview = await previewCoupon(req, restaurantId, couponCode, couponPhone, subtotal, safeDeliveryFee);
      if ('refused' in preview) return preview.refused;
      couponDiscount = preview.discount;
    }
    let total = Math.round((subtotal + safeDeliveryFee - couponDiscount) * 100) / 100;

    const paymentOptions = await getDeliveryPaymentOptions(restaurantId);
    const payment = choosePayment(paymentOptions, body, total, isPickup);
    if ('refused' in payment) return payment.refused;
    const { choice, paymentNote } = payment;

    const orderNumber = generateOrderNumber();

    // One use of the coupon, reserved under a lock (the limits are counted again); released below if no order comes out
    let coupon: ReservedCoupon | null = null;
    if (hasCoupon) {
      const r = await reserveOrderCoupon(restaurantId, couponCode, couponPhone, subtotal, safeDeliveryFee);
      if ('refused' in r) return r.refused;
      coupon = r.coupon;
      couponDiscount = coupon.discountCents / 100;
      total = Math.round((subtotal + safeDeliveryFee - couponDiscount) * 100) / 100;
    }
    try {

    const customer = await findOrCreateCustomer(restaurantId, body, isPickup);
    const phoneDigits = normalizePhone(customerPhone);
    const kitchenNote = kitchenNoteOf(body, isPickup, paymentNote, coupon);

    // The digital menu in the order pipeline (plan 2026-10-23 api-de-pedidos, Task 4b): the order is also an
    // ExternalOrder of the restaurant's "Cardápio digital", so it shows in Pedidos de delivery with its values and
    // its status. It is always accepted: an online payment attaches to the kitchen order created right below
    const written = await writeSiteOrder({
      restaurantId, orderNumber, customerId: customer?.id ?? null,
      customerName: singleLine(customerName), customerPhone: phoneDigits ? formatPhone(phoneDigits) : singleLine(customerPhone),
      customerEmail: customerEmail || null, isPickup,
      deliveryAddress: isPickup ? null : singleLine(deliveryAddress), deliveryCity, deliveryZipCode, kitchenNote,
      items: orderItems, subtotal, deliveryFee: safeDeliveryFee, discount: couponDiscount, total,
      paymentMethod: choice.paymentMethod, cashChangeFor: choice.changeFor, voucherBrand: choice.voucherBrand,
    });
    // The response used to read the stored 2-decimal values (money)
    const externalOrder = { id: written.externalOrderId };
    const order = {
      id: written.orderId, orderNumber, total: money(total), subtotal: money(subtotal), fees: money(safeDeliveryFee), status: 'PENDING',
      totalItems: orderItems.reduce((acc, i) => acc + i.quantity, 0),
    };
    if (coupon) await attachRedemption(coupon.redemptionId, externalOrder.id);

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
        discount: couponDiscount,
        coupon: coupon?.code ?? null,
      },
    });
    } catch (error) {
      // No order came out: the coupon use goes back
      if (coupon) await releaseRedemption(coupon.redemptionId).catch(() => {});
      throw error;
    }
  } catch (error: any) {
    console.error('Error creating delivery order:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Conflito ao criar pedido, tente novamente' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 });
  }
}
