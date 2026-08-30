// @ts-nocheck
/**
 * Test Data Fixtures for Integration Testing
 * Provides sample data for creating test scenarios
 */

export const TEST_RESTAURANTS = [
  {
    name: 'Pizzaria Bella Integration',
    status: 'ACTIVE' as const,
    subscriptionStatus: 'active' as const,
    address: 'Rua das Pizzas, 123',
    phone: '+55 11 3333-4444',
  },
  {
    name: 'Burger House Integration',
    status: 'ACTIVE' as const,
    subscriptionStatus: 'active' as const,
    address: 'Av. dos Burgers, 456',
    phone: '+55 11 5555-6666',
  },
];

export const TEST_USERS = [
  {
    email: 'owner-int@test.com',
    password: 'TestPass123!',
    name: 'Integration Owner',
    role: 'OWNER' as const,
  },
  {
    email: 'manager-int@test.com',
    password: 'TestPass123!',
    name: 'Integration Manager',
    role: 'MANAGER' as const,
  },
  {
    email: 'cook-int@test.com',
    password: 'TestPass123!',
    name: 'Integration Cook',
    role: 'COOK' as const,
  },
  {
    email: 'cashier-int@test.com',
    password: 'TestPass123!',
    name: 'Integration Cashier',
    role: 'CASHIER' as const,
  },
];

export const TEST_INGREDIENTS = [
  {
    code: 'FAR-TRIGO',
    name: 'Farinha de Trigo',
    unit: 'KG',
    minimumStock: 20,
    currentStock: 50,
    cost: 4.50,
  },
  {
    code: 'QUE-MUSS',
    name: 'Queijo Mussarela',
    unit: 'KG',
    minimumStock: 10,
    currentStock: 25,
    cost: 28.90,
  },
  {
    code: 'TOM-FRES',
    name: 'Tomate Fresco',
    unit: 'KG',
    minimumStock: 15,
    currentStock: 30,
    cost: 8.50,
  },
  {
    code: 'CAR-MOID',
    name: 'Carne Moída',
    unit: 'KG',
    minimumStock: 10,
    currentStock: 20,
    cost: 32.00,
  },
  {
    code: 'PAO-HAMB',
    name: 'Pão de Hambúrguer',
    unit: 'UN',
    minimumStock: 50,
    currentStock: 100,
    cost: 1.20,
  },
];

export const TEST_RECIPES = [
  {
    code: 'PIZ-MARG',
    name: 'Pizza Margherita',
    description: 'Pizza clássica italiana',
    baseYield: 8,
    ingredients: [
      { code: 'FAR-TRIGO', quantity: 0.5, unit: 'KG' },
      { code: 'QUE-MUSS', quantity: 0.3, unit: 'KG' },
      { code: 'TOM-FRES', quantity: 0.2, unit: 'KG' },
    ],
  },
  {
    code: 'HAM-CLAS',
    name: 'Hambúrguer Clássico',
    description: 'Hambúrguer tradicional',
    baseYield: 1,
    ingredients: [
      { code: 'PAO-HAMB', quantity: 2, unit: 'UN' },
      { code: 'CAR-MOID', quantity: 0.15, unit: 'KG' },
      { code: 'QUE-MUSS', quantity: 0.05, unit: 'KG' },
    ],
  },
];

export const TEST_SUPPLIERS = [
  {
    code: 'FOR-ALIM',
    name: 'Fornecedor de Alimentos LTDA',
    cnpj: '12.345.678/0001-90',
    phone: '+55 11 2222-3333',
    email: 'contato@fornecedor.com',
  },
  {
    code: 'DIST-BEBI',
    name: 'Distribuidora de Bebidas',
    cnpj: '98.765.432/0001-10',
    phone: '+55 11 4444-5555',
    email: 'vendas@distribuidora.com',
  },
];

export const TEST_ORDERS = [
  {
    type: 'DINE_IN',
    table: 'MESA-01',
    items: [
      { recipeCode: 'PIZ-MARG', quantity: 1, notes: 'Bem assada' },
    ],
  },
  {
    type: 'DELIVERY',
    customerName: 'João Silva',
    customerPhone: '+55 11 99999-1111',
    address: 'Rua Teste, 100',
    items: [
      { recipeCode: 'HAM-CLAS', quantity: 2 },
      { recipeCode: 'PIZ-MARG', quantity: 1 },
    ],
  },
];

export const TEST_STAFF = [
  {
    name: 'Carlos Cozinheiro',
    role: 'COOK',
    phone: '+55 11 98888-1111',
    email: 'carlos@restaurante.com',
    hourlyRate: 18.50,
  },
  {
    name: 'Maria Gerente',
    role: 'MANAGER',
    phone: '+55 11 98888-2222',
    email: 'maria@restaurante.com',
    hourlyRate: 25.00,
  },
  {
    name: 'Pedro Caixa',
    role: 'CASHIER',
    phone: '+55 11 98888-3333',
    email: 'pedro@restaurante.com',
    hourlyRate: 15.00,
  },
];

export const TEST_TRANSACTIONS = [
  {
    type: 'INCOME' as const,
    amount: 150.00,
    description: 'Venda - Pizza Margherita',
    category: 'Vendas',
  },
  {
    type: 'INCOME' as const,
    amount: 89.80,
    description: 'Venda - 2x Hambúrguer',
    category: 'Vendas',
  },
  {
    type: 'EXPENSE' as const,
    amount: 250.00,
    description: 'Compra - Carne Moída',
    category: 'Matéria Prima',
  },
];

/**
 * Generate unique test codes to avoid conflicts
 */
export function generateTestCode(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
}

/**
 * Create timestamped test data
 */
export function createTimestampedData<T extends Record<string, any>>(
  baseData: T
): T & { createdAt: Date; updatedAt: Date } {
  return {
    ...baseData,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Generate mock dates for testing
 */
export function getMockDates(daysBack: number = 7): {
  today: Date;
  yesterday: Date;
  lastWeek: Date;
  nextWeek: Date;
} {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - daysBack);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + daysBack);

  return { today, yesterday, lastWeek, nextWeek };
}

/**
 * Generate random test values
 */
export function generateRandomValues(): {
  price: number;
  quantity: number;
  percentage: number;
} {
  return {
    price: Math.round(Math.random() * 1000 * 100) / 100,
    quantity: Math.floor(Math.random() * 100) + 1,
    percentage: Math.round(Math.random() * 100 * 100) / 100,
  };
}
