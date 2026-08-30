// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { ExternalOrderStatus, DeliveryPlatform } from '@prisma/client';

interface WebhookPayload {
  platform: DeliveryPlatform;
  event: string;
  orderId: string;
  storeId?: string;
  [key: string]: any;
}

interface ProcessedOrder {
  customerId: string;
  status: ExternalOrderStatus;
  totalAmount: number;
  deliveryFee: number;
  platformFee: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  deliveryCity?: string;
  deliveryZipcode?: string;
  items: Array<{ externalItemId: string; name: string; quantity: number; price: number }>;
  specialInstructions?: string;
  orderReceivedAt?: Date;
  estimatedDeliveryTime?: Date;
  deliveredAt?: Date;
  eventTimestamp: Date;
  message: string;
}

export async function processDeliveryWebhook(payload: WebhookPayload) {
  const { platform, event, orderId } = payload;

  try {
    const integration = await prisma.deliveryIntegration.findUnique({
      where: { platform },
    });

    if (!integration) {
      console.error(`[Delivery Webhook] Integration not found for platform: ${platform}`);
      return { success: false, error: 'Integration not found' };
    }

    if (!integration.isActive) {
      console.error(`[Delivery Webhook] Integration is inactive for platform: ${platform}`);
      return { success: false, error: 'Integration is inactive' };
    }

    let externalOrder = await prisma.externalOrder.findUnique({
      where: {
        integrationId_externalOrderId: {
          integrationId: integration.id,
          externalOrderId: orderId,
        },
      },
    });

    let processedOrder: ProcessedOrder | null = null;
    
    if (platform === 'ifood') {
      processedOrder = await processIFoodWebhook(payload, integration);
    } else if (platform === 'uber_eats') {
      processedOrder = await processUberEatsWebhook(payload, integration);
    } else if (platform === 'rappi') {
      processedOrder = await processRappiWebhook(payload, integration);
    }

    if (!processedOrder) {
      return { success: false, error: 'Failed to process webhook' };
    }

    if (!externalOrder) {
      externalOrder = await prisma.externalOrder.create({
        data: {
          integrationId: integration.id,
          externalOrderId: orderId,
          externalCustomerId: processedOrder.customerId,
          status: processedOrder.status,
          totalAmount: processedOrder.totalAmount,
          deliveryFee: processedOrder.deliveryFee || 0,
          platformFee: processedOrder.platformFee || 0,
          customerName: processedOrder.customerName,
          customerPhone: processedOrder.customerPhone,
          customerEmail: processedOrder.customerEmail,
          deliveryAddress: processedOrder.deliveryAddress,
          deliveryCity: processedOrder.deliveryCity,
          deliveryZipcode: processedOrder.deliveryZipcode,
          items: JSON.stringify(processedOrder.items || []),
          specialInstructions: processedOrder.specialInstructions,
          orderReceivedAt: processedOrder.orderReceivedAt || new Date(),
          estimatedDeliveryTime: processedOrder.estimatedDeliveryTime,
        },
      });
    } else {
      externalOrder = await prisma.externalOrder.update({
        where: { id: externalOrder.id },
        data: {
          status: processedOrder.status,
          totalAmount: processedOrder.totalAmount,
          deliveryFee: processedOrder.deliveryFee || externalOrder.deliveryFee,
          platformFee: processedOrder.platformFee || externalOrder.platformFee,
          estimatedDeliveryTime: processedOrder.estimatedDeliveryTime || externalOrder.estimatedDeliveryTime,
          deliveredAt: processedOrder.deliveredAt,
        },
      });
    }

    await prisma.deliveryLog.create({
      data: {
        externalOrderId: externalOrder.id,
        eventType: mapEventType(event),
        previousStatus: externalOrder.status,
        newStatus: processedOrder.status,
        message: processedOrder.message,
        eventTimestamp: new Date(processedOrder.eventTimestamp || Date.now()),
      },
    });

    await prisma.deliveryIntegration.update({
      where: { id: integration.id },
      data: {
        totalOrdersSynced: integration.totalOrdersSynced + (externalOrder ? 0 : 1),
        lastOrderAt: new Date(),
        lastSyncedAt: new Date(),
        syncStatus: 'SUCCESS',
      },
    });

    console.log(`[Delivery Webhook] Processed order ${orderId} from ${platform}`);
    return { success: true, orderId: externalOrder.id };
  } catch (error) {
    console.error(`[Delivery Webhook] Error processing webhook:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function processIFoodWebhook(payload: any, integration: any): Promise<ProcessedOrder> {
  const {
    id,
    status,
    customer = {},
    deliveryAddress = {},
    items = [],
    totalAmount,
    deliveryFee = 0,
    platformFee = 0,
    observations,
    event,
  } = payload;

  const statusMap: { [key: string]: ExternalOrderStatus } = {
    'PENDING_CONFIRMATION': 'PENDING',
    'CONFIRMED': 'CONFIRMED',
    'PREPARING': 'PREPARING',
    'READY_FOR_PICKUP': 'READY',
    'DISPATCHED': 'PICKED_UP',
    'DELIVERED': 'DELIVERED',
    'CANCELLED': 'CANCELLED',
    'REJECTED': 'REJECTED',
  };

  return {
    customerId: customer.id || customer.phone,
    status: statusMap[status] || 'PENDING',
    totalAmount: totalAmount || 0,
    deliveryFee,
    platformFee,
    customerName: customer.name || 'Unknown Customer',
    customerPhone: customer.phone || '',
    customerEmail: customer.email,
    deliveryAddress: deliveryAddress.address || '',
    deliveryCity: deliveryAddress.city,
    deliveryZipcode: deliveryAddress.zipcode,
    items: items.map((item: any) => ({
      externalItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    specialInstructions: observations,
    orderReceivedAt: new Date(),
    eventTimestamp: new Date(),
    message: `iFood webhook event: ${event}`,
  };
}

async function processUberEatsWebhook(payload: any, integration: any): Promise<ProcessedOrder> {
  const {
    order_id,
    resource_id,
    data = {},
  } = payload;

  const order = data.order || {};
  const status = data.status || order.status;

  const statusMap: { [key: string]: ExternalOrderStatus } = {
    'ACCEPTED': 'CONFIRMED',
    'SCHEDULED': 'CONFIRMED',
    'CONFIRMED': 'PREPARING',
    'PREPARING': 'PREPARING',
    'READY_FOR_PICKUP': 'READY',
    'PICKED_UP': 'PICKED_UP',
    'IN_DELIVERY': 'PICKED_UP',
    'DELIVERED': 'DELIVERED',
    'CANCELLED': 'CANCELLED',
    'REJECTED': 'REJECTED',
  };

  return {
    customerId: order.consumer_id || order.phone,
    status: statusMap[status] || 'PENDING',
    totalAmount: order.total_amount || 0,
    deliveryFee: order.delivery_fee || 0,
    platformFee: order.platform_fee || 0,
    customerName: order.consumer_name || 'Unknown Customer',
    customerPhone: order.consumer_phone || '',
    customerEmail: order.consumer_email,
    deliveryAddress: order.delivery_address || '',
    deliveryCity: order.delivery_city,
    deliveryZipcode: order.delivery_zipcode,
    items: (order.items || []).map((item: any) => ({
      externalItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    specialInstructions: order.special_instructions,
    orderReceivedAt: new Date(),
    estimatedDeliveryTime: order.estimated_delivery_time ? new Date(order.estimated_delivery_time) : undefined,
    eventTimestamp: new Date(),
    message: `Uber Eats order status: ${status}`,
  };
}

async function processRappiWebhook(payload: any, integration: any): Promise<ProcessedOrder> {
  const {
    id,
    status,
    customer = {},
    delivery = {},
    items = [],
    total_amount,
    delivery_fee = 0,
    commission = 0,
    notes,
    event,
  } = payload;

  const statusMap: { [key: string]: ExternalOrderStatus } = {
    'PENDING': 'PENDING',
    'CONFIRMED': 'CONFIRMED',
    'PREPARING': 'PREPARING',
    'READY': 'READY',
    'DISPATCHED': 'PICKED_UP',
    'DELIVERED': 'DELIVERED',
    'CANCELLED': 'CANCELLED',
    'REJECTED': 'REJECTED',
  };

  return {
    customerId: customer.id || customer.phone,
    status: statusMap[status] || 'PENDING',
    totalAmount: total_amount || 0,
    deliveryFee: delivery_fee,
    platformFee: commission,
    customerName: customer.name || 'Unknown Customer',
    customerPhone: customer.phone || '',
    customerEmail: customer.email,
    deliveryAddress: delivery.address || '',
    deliveryCity: delivery.city,
    deliveryZipcode: delivery.zipcode,
    items: items.map((item: any) => ({
      externalItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    specialInstructions: notes,
    orderReceivedAt: new Date(),
    eventTimestamp: new Date(),
    message: `Rappi webhook event: ${event}`,
  };
}

function mapEventType(event: string) {
  const eventMap: { [key: string]: any } = {
    'STATUS_CHANGED': 'STATUS_CHANGED',
    'status_changed': 'STATUS_CHANGED',
    'DELIVERY_TIME_UPDATED': 'DELIVERY_ESTIMATED_TIME_UPDATED',
    'delivery_time_updated': 'DELIVERY_ESTIMATED_TIME_UPDATED',
    'DRIVER_ASSIGNED': 'DRIVER_ASSIGNED',
    'driver_assigned': 'DRIVER_ASSIGNED',
    'DRIVER_LOCATION': 'DRIVER_LOCATION_UPDATED',
    'driver_location': 'DRIVER_LOCATION_UPDATED',
    'CUSTOMER_CONTACT': 'CUSTOMER_CONTACT_REQUESTED',
    'customer_contact': 'CUSTOMER_CONTACT_REQUESTED',
    'CANCELLED': 'DELIVERY_CANCELLED',
    'cancelled': 'DELIVERY_CANCELLED',
    'EXCEEDED_TIME': 'ORDER_PREPARATION_TIME_EXCEEDED',
    'exceeded_time': 'ORDER_PREPARATION_TIME_EXCEEDED',
  };
  return eventMap[event] || 'STATUS_CHANGED';
}

export async function verifyWebhookSignature(
  platform: DeliveryPlatform,
  payload: any,
  signature: string,
  secret: string
): Promise<boolean> {
  const crypto = require('crypto');
  
  if (platform === 'ifood') {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('base64');
    return hash === signature;
  } else if (platform === 'uber_eats') {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');
    return expectedSignature === signature;
  } else if (platform === 'rappi') {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return hash === signature;
  }
  return false;
}
