import type { RestaurantRole } from '@/lib/auth/restaurant-role';

/** Who works the delivery orders: the menu's "Pedidos de delivery" roles (the kitchen sees them on its own screen) */
export const DELIVERY_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'CASHIER'];
