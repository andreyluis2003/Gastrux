import type { RestaurantRole } from '@/lib/auth/restaurant-role';

/** Who may do what at the cash register (spec rule 9). */
export const CASHIER_PLUS: RestaurantRole[] = ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'];
export const MANAGER_PLUS: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN'];
export const isManager = (role: RestaurantRole) => MANAGER_PLUS.includes(role);
