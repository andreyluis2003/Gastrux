import { requireRestaurantRole, type RestaurantRole } from '@/lib/auth/restaurant-role';

/**
 * Who registers suppliers (owner decision 2026-10-09): owner, manager and cook (in a small restaurant
 * the cook does the buying); the cashier neither sees nor registers them. By the role in THIS
 * restaurant, not the user's global role.
 */
export const SUPPLIER_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'COOK'];

export const requireSupplierAccess = () =>
  requireRestaurantRole(SUPPLIER_ROLES, 'Fornecedores: só dono, gerente ou cozinheiro');
