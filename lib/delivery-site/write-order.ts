// Writes the delivery-site order: an ExternalOrder of the "Cardápio digital" plus its kitchen Order.
// Shared by the public order route and the weekly-menu release (spec 2026-11-10 cardapio-da-semana).
import type { DeliveryPaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ownIntegration } from '@/lib/delivery-orders/integrations';

export interface SiteOrderInput {
  restaurantId: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  isPickup: boolean;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryZipCode: string | null;
  kitchenNote: string;
  items: { recipeId: string; name: string; quantity: number; specialInstructions?: string }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: DeliveryPaymentMethod;
  cashChangeFor: number | null;
  voucherBrand: string | null;
}

export async function writeSiteOrder(input: SiteOrderInput): Promise<{ orderId: string; externalOrderId: string }> {
  const site = await ownIntegration(input.restaurantId, 'delivery_site');
  // One transaction: an ExternalOrder never stays behind without its kitchen Order
  return prisma.$transaction(async (tx) => {
    const externalOrder = await tx.externalOrder.create({
      data: {
        restaurantId: input.restaurantId, integrationId: site.id, externalOrderId: input.orderNumber, status: 'CONFIRMED',
        totalAmount: input.total, subtotal: input.subtotal, deliveryFee: input.deliveryFee, discount: input.discount, platformFee: 0,
        paymentMethod: input.paymentMethod, paidOnline: false, customerId: input.customerId,
        customerName: input.customerName, customerPhone: input.customerPhone, customerEmail: input.customerEmail || null,
        deliveryAddress: input.isPickup ? 'Retirada no local' : input.deliveryAddress ?? '',
        deliveryCity: input.deliveryCity || null, deliveryZipcode: input.deliveryZipCode || null,
        items: JSON.stringify(input.items.map((i) => ({ name: i.name, quantity: i.quantity }))),
        specialInstructions: input.kitchenNote,
      },
      select: { id: true },
    });

    const order = await tx.order.create({
      data: {
        restaurantId: input.restaurantId,
        orderNumber: input.orderNumber,
        orderType: 'DELIVERY',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalItems: input.items.reduce((acc, i) => acc + i.quantity, 0),
        subtotal: input.subtotal,
        fees: input.deliveryFee,
        discount: input.discount,
        total: input.total,
        paymentMethod: input.paymentMethod,
        cashChangeFor: input.cashChangeFor,
        voucherBrand: input.voucherBrand,
        specialInstructions: input.kitchenNote,
        customerId: input.customerId || undefined,
        externalOrderId: externalOrder.id,
        items: {
          create: input.items.map((i) => ({ recipeId: i.recipeId, quantity: i.quantity, specialInstructions: i.specialInstructions })),
        },
      },
      select: { id: true },
    });
    await tx.externalOrder.update({ where: { id: externalOrder.id }, data: { internalOrderId: order.id } });
    return { orderId: order.id, externalOrderId: externalOrder.id };
  });
}
