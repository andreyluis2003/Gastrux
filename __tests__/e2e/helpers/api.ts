import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE = 'http://localhost:3000';

export interface AuthSession {
  userId: string;
  email: string;
  sessionToken?: string;
  cookies?: string;
}

/**
 * Make an authenticated API request
 */
export async function makeAuthenticatedRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  session: AuthSession,
  body?: Record<string, any>
) {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session.cookies) {
    headers['Cookie'] = session.cookies;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    console.error(`API request failed: ${method} ${endpoint}`, error);
    throw error;
  }
}

/**
 * Get all ingredients for a restaurant
 */
export async function getIngredients(session: AuthSession) {
  const response = await makeAuthenticatedRequest('GET', '/api/ingredients', session);
  return response.data;
}

/**
 * Create a new ingredient
 */
export async function createIngredient(
  session: AuthSession,
  data: { code: string; name: string; unit?: string; minimumStock?: number }
) {
  const response = await makeAuthenticatedRequest('POST', '/api/ingredients', session, data);
  return response.data;
}

/**
 * Get a specific ingredient
 */
export async function getIngredient(session: AuthSession, id: string) {
  const response = await makeAuthenticatedRequest('GET', `/api/ingredients/${id}`, session);
  if (response.status === 404) {
    return null;
  }
  return response.data;
}

/**
 * Update an ingredient
 */
export async function updateIngredient(
  session: AuthSession,
  id: string,
  data: Record<string, any>
) {
  const response = await makeAuthenticatedRequest('PUT', `/api/ingredients/${id}`, session, data);
  return response.data;
}

/**
 * Delete an ingredient
 */
export async function deleteIngredient(session: AuthSession, id: string) {
  const response = await makeAuthenticatedRequest('DELETE', `/api/ingredients/${id}`, session);
  return response.data;
}

/**
 * Get stock movements for a restaurant
 */
export async function getStockMovements(session: AuthSession) {
  const response = await makeAuthenticatedRequest('GET', '/api/stock/movement', session);
  return response.data;
}

/**
 * Get recipes for a restaurant
 */
export async function getRecipes(session: AuthSession) {
  const response = await makeAuthenticatedRequest('GET', '/api/recipes', session);
  return response.data;
}

/**
 * Get staff members for a restaurant
 */
export async function getStaffMembers(session: AuthSession) {
  const response = await makeAuthenticatedRequest('GET', '/api/admin/users', session);
  return response.data;
}
