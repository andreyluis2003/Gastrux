// @ts-nocheck
/**
 * API Workflow Helpers for Integration Testing
 * Provides high-level helpers for common API operations
 */

const API_BASE = 'http://localhost:3000';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  currentRestaurantId: string;
  cookies: string;
}

export interface TestRestaurant {
  id: string;
  name: string;
  status: string;
  ownerId: string;
}

/**
 * Make an authenticated API request
 */
export async function makeRequest(
  method: string,
  endpoint: string,
  user: TestUser,
  body?: Record<string, any>
): Promise<{ status: number; data: any }> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: user.cookies,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

/**
 * Create a complete order workflow
 * Order → Items → Status Updates
 */
export async function createCompleteOrderWorkflow(
  user: TestUser,
  params: {
    type?: string;
    table?: string;
    items: Array<{
      recipeId: string;
      quantity: number;
      notes?: string;
    }>;
  }
) {
  // Step 1: Create order
  const orderResponse = await makeRequest('POST', '/api/kds/orders', user, {
    type: params.type || 'DINE_IN',
    table: params.table || 'MESA-01',
    items: params.items,
  });

  if (orderResponse.status !== 201 && orderResponse.status !== 200) {
    throw new Error(`Failed to create order: ${JSON.stringify(orderResponse.data)}`);
  }

  const order = orderResponse.data;

  return {
    order,
    orderId: order.id,
    status: order.status,
  };
}

/**
 * Process order to completion
 * RECEIVED → PREPARING → READY → COMPLETED
 */
export async function processOrderToCompletion(
  user: TestUser,
  orderId: string
) {
  const statuses = ['PREPARING', 'READY', 'COMPLETED'];
  const updates = [];

  for (const status of statuses) {
    const response = await makeRequest(
      'PUT',
      `/api/kds/orders/${orderId}`,
      user,
      { status }
    );

    if (response.status !== 200) {
      throw new Error(`Failed to update order to ${status}: ${JSON.stringify(response.data)}`);
    }

    updates.push({ status, data: response.data });
  }

  return { orderId, updates, finalStatus: 'COMPLETED' };
}

/**
 * Create stock movement and verify effects
 */
export async function createStockMovement(
  user: TestUser,
  params: {
    ingredientId: string;
    quantity: number;
    type: 'ENTRY' | 'WITHDRAWAL' | 'ADJUSTMENT';
    reason?: string;
  }
) {
  const response = await makeRequest('POST', '/api/stock/movement', user, {
    ingredientId: params.ingredientId,
    quantity: params.quantity,
    type: params.type,
    reason: params.reason || 'Test movement',
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create stock movement: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

/**
 * Create ingredient with stock
 */
export async function createIngredientWithStock(
  user: TestUser,
  params: {
    code: string;
    name: string;
    categoryId?: string;
    unit: string;
    minimumStock?: number;
    initialStock?: number;
  }
) {
  // Create ingredient
  const ingredientResponse = await makeRequest('POST', '/api/ingredients', user, {
    code: params.code,
    name: params.name,
    unit: params.unit || 'UN',
    minimumStock: params.minimumStock || 10,
    categoryId: params.categoryId,
  });

  if (ingredientResponse.status !== 201 && ingredientResponse.status !== 200) {
    throw new Error(`Failed to create ingredient: ${JSON.stringify(ingredientResponse.data)}`);
  }

  const ingredient = ingredientResponse.data;

  // Add initial stock if specified
  if (params.initialStock && params.initialStock > 0) {
    await makeRequest('POST', '/api/stock/movement', user, {
      ingredientId: ingredient.id,
      quantity: params.initialStock,
      type: 'ENTRY',
      reason: 'Initial stock',
    });
  }

  return ingredient;
}

/**
 * Create supplier with ingredients
 */
export async function createSupplierWithIngredients(
  user: TestUser,
  params: {
    code: string;
    name: string;
    cnpj?: string;
    ingredients?: Array<{ ingredientId: string; price: number }>;
  }
) {
  const response = await makeRequest('POST', '/api/suppliers', user, {
    code: params.code,
    name: params.name,
    cnpj: params.cnpj || '00.000.000/0001-00',
    ingredients: params.ingredients || [],
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create supplier: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

/**
 * Create recipe with ingredients
 */
export async function createRecipeWithIngredients(
  user: TestUser,
  params: {
    code: string;
    name: string;
    description?: string;
    baseYield: number;
    ingredients: Array<{
      ingredientId: string;
      quantity: number;
      unit: string;
    }>;
  }
) {
  const response = await makeRequest('POST', '/api/recipes', user, {
    code: params.code,
    name: params.name,
    description: params.description,
    baseYield: params.baseYield,
    ingredients: params.ingredients,
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create recipe: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

/**
 * Create financial transaction
 */
export async function createFinancialTransaction(
  user: TestUser,
  params: {
    type: 'INCOME' | 'EXPENSE';
    amount: number;
    description: string;
    categoryId?: string;
    date?: string;
  }
) {
  const response = await makeRequest('POST', '/api/financial/transactions', user, {
    type: params.type,
    amount: params.amount,
    description: params.description,
    categoryId: params.categoryId,
    date: params.date || new Date().toISOString(),
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create transaction: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

/**
 * Get current stock for ingredient
 */
export async function getCurrentStock(
  user: TestUser,
  ingredientId: string
) {
  const response = await makeRequest('GET', `/api/stock?ingredientId=${ingredientId}`, user);
  return response.data;
}

/**
 * Get notifications for user
 */
export async function getNotifications(user: TestUser) {
  const response = await makeRequest('GET', '/api/notifications/list', user);
  return response.data;
}

/**
 * Get audit logs
 */
export async function getAuditLogs(user: TestUser, params?: { entityType?: string; entityId?: string }) {
  const query = new URLSearchParams();
  if (params?.entityType) query.set('entityType', params.entityType);
  if (params?.entityId) query.set('entityId', params.entityId);

  const response = await makeRequest(
    'GET',
    `/api/admin/audit-logs?${query.toString()}`,
    user
  );
  return response.data;
}

/**
 * Verify multi-restaurant data isolation
 * Ensures restaurant A cannot see restaurant B data
 */
export async function verifyDataIsolation(
  userA: TestUser,
  userB: TestUser,
  resource: string
): Promise<{ isolated: boolean; details: string }> {
  // Get data for user A
  const responseA = await makeRequest('GET', resource, userA);
  const dataA = responseA.data;

  // Get data for user B
  const responseB = await makeRequest('GET', resource, userB);
  const dataB = responseB.data;

  // Check if there's any overlap in IDs
  const idsA = new Set(Array.isArray(dataA) ? dataA.map((d: any) => d.id) : []);
  const idsB = new Set(Array.isArray(dataB) ? dataB.map((d: any) => d.id) : []);

  const intersection = [...idsA].filter(id => idsB.has(id));

  if (intersection.length > 0) {
    return {
      isolated: false,
      details: `Found ${intersection.length} overlapping IDs: ${intersection.join(', ')}`,
    };
  }

  return {
    isolated: true,
    details: `No data overlap between restaurants ${userA.currentRestaurantId} and ${userB.currentRestaurantId}`,
  };
}

/**
 * Create production plan
 */
export async function createProductionPlan(
  user: TestUser,
  params: {
    planDate: string;
    items: Array<{
      recipeId: string;
      quantity: number;
    }>;
  }
) {
  const response = await makeRequest('POST', '/api/production-plans', user, {
    planDate: params.planDate,
    items: params.items,
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create production plan: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

/**
 * Create shopping list from consolidated needs
 */
export async function createShoppingList(
  user: TestUser,
  params: {
    name?: string;
    autoGenerate?: boolean;
  }
) {
  const response = await makeRequest('POST', '/api/shopping-lists', user, {
    name: params.name || 'Test Shopping List',
    autoGenerate: params.autoGenerate !== false,
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create shopping list: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}
