// @ts-nocheck
import { createSwaggerSpec } from 'next-swagger-doc';

export const getApiDocs = () => {
  const spec = createSwaggerSpec({
    apiFolder: 'app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Gastrux - API',
        version: '1.0.0',
        description: `
API REST para gestão completa de restaurantes com multi-tenancy.

## Principais Funcionalidades

- **Autenticação**: Sistema baseado em NextAuth com múltiplos provedores
- **Multi-Tenancy**: Isolamento total entre restaurantes
- **Gestão de Ingredientes**: CRUD + categorias + fornecedores
- **Receitas**: Composição de receitas com custos dinâmicos
- **Estoque**: Controle de estoque com movimentações e alertas
- **Pedidos**: Sistema de pedidos e vendas (POS)
- **Relatórios**: Dashboards e análises preditivas
- **Fornecedores**: Integração e sincronização
- **Produção**: Planos de produção baseados em previsão

## Autenticação

A maioria dos endpoints requer autenticação via session cookie do NextAuth.
Envie o cookie \`next-auth.session-token\` nas requisições.

## Roles Suportadas

- **OWNER**: Acesso total
- **ADMIN**: Gestão administrativa
- **MANAGER**: Gestão operacional
- **CASHIER**: PDV e vendas
- **COOK**: Cozinha e produção
        `,
        contact: {
          name: 'Suporte',
          email: 'suporte@restaurantes.com',
        },
      },
      servers: [
        {
          url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
          description: 'Ambiente atual',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Autenticação e registro' },
        { name: 'Ingredients', description: 'Gestão de ingredientes' },
        { name: 'Recipes', description: 'Receitas e composições' },
        { name: 'Stock', description: 'Controle de estoque' },
        { name: 'Orders', description: 'Pedidos e vendas' },
        { name: 'Suppliers', description: 'Fornecedores' },
        { name: 'Reports', description: 'Relatórios e análises' },
        { name: 'Restaurant', description: 'Gestão do restaurante' },
        { name: 'Users', description: 'Gestão de usuários' },
        { name: 'Billing', description: 'Assinaturas e pagamentos' },
        { name: 'Payments', description: 'Gateway de pagamentos' },
        { name: 'Mercado Pago', description: 'Integração Mercado Pago' },
        { name: 'Stripe Connect', description: 'Integração Stripe Connect' },
      ],
      components: {
        securitySchemes: {
          sessionAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'next-auth.session-token',
            description: 'NextAuth session cookie',
          },
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              details: { type: 'object' },
            },
          },
          Ingredient: {
            type: 'object',
            required: ['name', 'unit', 'restaurantId'],
            properties: {
              id: { type: 'string', format: 'cuid' },
              name: { type: 'string', example: 'Tomate' },
              description: { type: 'string', nullable: true },
              unit: { type: 'string', example: 'kg' },
              costPerUnit: { type: 'number', example: 5.5 },
              stockQuantity: { type: 'number', example: 100 },
              minStockLevel: { type: 'number', nullable: true },
              categoryId: { type: 'string', nullable: true },
              supplierId: { type: 'string', nullable: true },
              restaurantId: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Recipe: {
            type: 'object',
            required: ['name', 'restaurantId'],
            properties: {
              id: { type: 'string', format: 'cuid' },
              name: { type: 'string', example: 'Molho Tomate' },
              description: { type: 'string', nullable: true },
              yieldQuantity: { type: 'number', example: 1000 },
              yieldUnit: { type: 'string', example: 'ml' },
              preparationTime: { type: 'integer', nullable: true },
              instructions: { type: 'string', nullable: true },
              restaurantId: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Order: {
            type: 'object',
            required: ['orderNumber', 'status', 'total', 'restaurantId'],
            properties: {
              id: { type: 'string', format: 'cuid' },
              orderNumber: { type: 'string', example: 'PED-001' },
              status: {
                type: 'string',
                enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'],
              },
              total: { type: 'number', example: 45.5 },
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/OrderItem' },
              },
              customerId: { type: 'string', nullable: true },
              restaurantId: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          OrderItem: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              recipeId: { type: 'string', nullable: true },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              subtotal: { type: 'number' },
              notes: { type: 'string', nullable: true },
            },
          },
          Supplier: {
            type: 'object',
            required: ['name', 'restaurantId'],
            properties: {
              id: { type: 'string', format: 'cuid' },
              name: { type: 'string' },
              contactEmail: { type: 'string', format: 'email', nullable: true },
              contactPhone: { type: 'string', nullable: true },
              deliveryTime: { type: 'integer', nullable: true },
              paymentTerms: { type: 'string', nullable: true },
              rating: { type: 'number', nullable: true },
              restaurantId: { type: 'string' },
            },
          },
          StockMovement: {
            type: 'object',
            required: ['type', 'quantity', 'ingredientId', 'restaurantId'],
            properties: {
              id: { type: 'string' },
              type: {
                type: 'string',
                enum: ['ENTRY', 'EXIT', 'ADJUSTMENT', 'LOSS', 'PRODUCTION'],
              },
              quantity: { type: 'number' },
              unitCost: { type: 'number', nullable: true },
              reason: { type: 'string', nullable: true },
              ingredientId: { type: 'string' },
              restaurantId: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          Payment: {
            type: 'object',
            required: ['gateway', 'amount', 'method'],
            properties: {
              id: { type: 'string', format: 'cuid' },
              restaurantId: { type: 'string', nullable: true },
              gateway: {
                type: 'string',
                enum: ['MERCADO_PAGO', 'STRIPE_CONNECT', 'MANUAL'],
              },
              gatewayPaymentId: { type: 'string', nullable: true },
              amount: { type: 'number', example: 99.9 },
              amountRefunded: { type: 'number', example: 0 },
              currency: { type: 'string', example: 'BRL' },
              method: {
                type: 'string',
                enum: ['CASH', 'CARD', 'PIX', 'MERCADO_PAGO', 'STRIPE', 'BANK_TRANSFER', 'OTHER'],
              },
              status: {
                type: 'string',
                enum: ['PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED', 'CHARGEBACK', 'SETTLED'],
              },
              customerEmail: { type: 'string', nullable: true },
              customerName: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              platformFee: { type: 'number', nullable: true },
              gatewayFee: { type: 'number', nullable: true },
              netAmount: { type: 'number', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          MercadoPagoPreference: {
            type: 'object',
            properties: {
              paymentId: { type: 'string' },
              preferenceId: { type: 'string' },
              initPoint: { type: 'string', format: 'uri' },
              externalReference: { type: 'string' },
              totalAmount: { type: 'number' },
            },
          },
          StripePaymentIntent: {
            type: 'object',
            properties: {
              paymentId: { type: 'string' },
              clientSecret: { type: 'string' },
              paymentIntentId: { type: 'string' },
              amount: { type: 'number' },
              status: { type: 'string' },
            },
          },
          PaymentRefund: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              paymentId: { type: 'string' },
              amount: { type: 'number' },
              status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
              gateway: { type: 'string' },
              reason: { type: 'string', nullable: true },
              completedAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          Subscription: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              restaurantId: { type: 'string', nullable: true },
              tier: { type: 'string' },
              planName: { type: 'string', nullable: true },
              billingCycle: { type: 'string', enum: ['monthly', 'annual'] },
              gateway: { type: 'string' },
              amount: { type: 'number' },
              status: { type: 'string' },
              currentPeriodStart: { type: 'string', format: 'date-time', nullable: true },
              currentPeriodEnd: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
        responses: {
          Unauthorized: {
            description: 'Usuário não autenticado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
              },
            },
          },
          Forbidden: {
            description: 'Acesso negado para esta operação',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: 'Forbidden', code: 'INSUFFICIENT_PERMISSIONS' },
              },
            },
          },
          NotFound: {
            description: 'Recurso não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: 'Not Found', code: 'RESOURCE_NOT_FOUND' },
              },
            },
          },
          BadRequest: {
            description: 'Requisição inválida',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: 'Invalid input', code: 'VALIDATION_ERROR' },
              },
            },
          },
          InternalError: {
            description: 'Erro interno do servidor',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: 'Internal Server Error', code: 'INTERNAL_ERROR' },
              },
            },
          },
        },
      },
      security: [{ sessionAuth: [] }],
    },
  });
  return spec;
};
