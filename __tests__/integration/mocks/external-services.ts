// @ts-nocheck
/**
 * External Service Mocks for Integration Testing
 * Provides mock implementations for external APIs
 */

export interface MockWebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
  signature?: string;
}

/**
 * Mock iFood order webhook payload
 */
export function mockIFoodWebhook(
  orderId: string,
  restaurantId: string,
  items: Array<{ name: string; quantity: number; price: number }> = []
): MockWebhookPayload {
  return {
    event: 'order.created',
    timestamp: new Date().toISOString(),
    data: {
      id: `ifood-${orderId}`,
      restaurantId,
      displayId: `PED-${Math.floor(Math.random() * 10000)}`,
      type: 'DELIVERY',
      status: 'PLACED',
      items: items.length > 0 ? items : [
        { name: 'Pizza Margherita', quantity: 1, price: 45.90 },
        { name: 'Refrigerante 2L', quantity: 1, price: 12.00 },
      ],
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 57.90),
      customer: {
        name: 'Test Customer',
        phone: '+55 11 99999-9999',
      },
      delivery: {
        address: 'Rua Teste, 123',
        city: 'São Paulo',
        estimatedTime: '45-60 min',
      },
      payments: {
        method: 'CREDIT_CARD',
        prepaid: true,
      },
    },
  };
}

/**
 * Mock Rappi order webhook payload
 */
export function mockRappiWebhook(
  orderId: string,
  restaurantId: string,
  items: Array<{ name: string; quantity: number; price: number }> = []
): MockWebhookPayload {
  return {
    event: 'order.new',
    timestamp: new Date().toISOString(),
    data: {
      id: `rappi-${orderId}`,
      storeId: restaurantId,
      orderCode: `RAP-${Math.floor(Math.random() * 10000)}`,
      state: 'PENDING',
      items: items.length > 0 ? items : [
        { name: 'Hambúrguer Clássico', quantity: 2, price: 28.50 },
        { name: 'Batata Frita M', quantity: 1, price: 15.00 },
      ],
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 72.00),
      customer: {
        firstName: 'Test',
        lastName: 'Customer',
        phone: '+55 11 98888-8888',
      },
      address: {
        street: 'Av. Teste',
        number: '456',
        city: 'São Paulo',
        deliveryTime: 35,
      },
      payment: {
        type: 'ONLINE',
        status: 'APPROVED',
      },
    },
  };
}

/**
 * Mock Stripe payment confirmation webhook
 */
export function mockStripePaymentConfirmation(
  paymentIntentId: string,
  status: 'succeeded' | 'failed' | 'canceled' = 'succeeded'
): MockWebhookPayload {
  return {
    event: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    signature: 'whsec_test_signature',
    data: {
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 5790,
      amount_received: status === 'succeeded' ? 5790 : 0,
      currency: 'brl',
      status,
      charges: {
        data: [
          {
            id: `ch_${Math.random().toString(36).substring(2)}`,
            status: status === 'succeeded' ? 'succeeded' : 'failed',
            receipt_url: status === 'succeeded' ? 'https://pay.stripe.com/receipts/...' : null,
          },
        ],
      },
      metadata: {
        orderId: `order-${Date.now()}`,
        restaurantId: `rest-${Date.now()}`,
      },
    },
  };
}

/**
 * Mock payment gateway error
 */
export function mockPaymentGatewayError(
  errorType: 'card_declined' | 'insufficient_funds' | 'expired_card' | 'processing_error' = 'card_declined'
): { error: { type: string; code: string; message: string } } {
  const errors = {
    card_declined: {
      type: 'card_error',
      code: 'card_declined',
      message: 'Seu cartão foi recusado.',
    },
    insufficient_funds: {
      type: 'card_error',
      code: 'insufficient_funds',
      message: 'Saldo insuficiente no cartão.',
    },
    expired_card: {
      type: 'card_error',
      code: 'expired_card',
      message: 'Cartão expirado.',
    },
    processing_error: {
      type: 'api_error',
      code: 'processing_error',
      message: 'Erro ao processar pagamento. Tente novamente.',
    },
  };

  return { error: errors[errorType] };
}

/**
 * Mock delivery status update
 */
export function mockDeliveryStatusUpdate(
  orderId: string,
  status: 'CONFIRMED' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'DELIVERING' | 'DELIVERED'
): MockWebhookPayload {
  return {
    event: 'delivery.status_updated',
    timestamp: new Date().toISOString(),
    data: {
      orderId,
      status,
      previousStatus: 'CONFIRMED',
      timestamp: new Date().toISOString(),
      driver: status !== 'CONFIRMED' ? {
        id: `drv_${Date.now()}`,
        name: 'João Entregador',
        phone: '+55 11 97777-7777',
        vehicle: 'Moto - ABC-1234',
      } : null,
      estimatedDeliveryTime: status === 'DELIVERING' ? '15 min' : null,
    },
  };
}

/**
 * Mock menu synchronization webhook
 */
export function mockMenuSyncWebhook(
  restaurantId: string,
  action: 'ITEM_CREATED' | 'ITEM_UPDATED' | 'ITEM_DELETED' = 'ITEM_CREATED'
): MockWebhookPayload {
  return {
    event: 'menu.sync',
    timestamp: new Date().toISOString(),
    data: {
      restaurantId,
      action,
      item: {
        id: `item-${Date.now()}`,
        name: 'Novo Item Teste',
        description: 'Descrição do item de teste',
        price: 29.90,
        category: 'Principais',
        available: true,
        imageUrl: 'https://www.internal-displacement.org/.netlify/images?url=https%3A%2F%2Fapi.internal-displacement.org%2Fsites%2Fdefault%2Ffiles%2Finline-images%2FIDMC_DRC_Graph2.1%2520%25281%2529.png&cd=ba114351c1ea05b769a9881329280154',
      },
    },
  };
}

/**
 * Create mock HTTP response for external API
 */
export function createMockResponse(
  status: number,
  data: Record<string, any>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Mock fetch for external APIs
 */
export function createMockFetch(
  responses: Map<string, { status: number; data: any }>
): typeof fetch {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = url.toString();

    for (const [pattern, response] of responses) {
      if (urlString.includes(pattern)) {
        return createMockResponse(response.status, response.data);
      }
    }

    return createMockResponse(404, { error: 'Not found' });
  };
}

/**
 * Setup mock environment for external services
 */
export function setupMockEnvironment(): void {
  // Mock environment variables
  process.env.IFOOD_WEBHOOK_SECRET = 'ifood_test_secret';
  process.env.RAPPI_WEBHOOK_SECRET = 'rappi_test_secret';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_...';
}

/**
 * Cleanup mock environment
 */
export function cleanupMockEnvironment(): void {
  delete process.env.IFOOD_WEBHOOK_SECRET;
  delete process.env.RAPPI_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
}
