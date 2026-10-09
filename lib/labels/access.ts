import { requireRestaurantRole, type RestaurantRole } from '@/lib/auth/restaurant-role';

/** Who prints and settles food labels (spec 2026-10-09): owner, manager, cook; not the cashier */
export const LABEL_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'COOK'];
export const requireLabelAccess = () => requireRestaurantRole(LABEL_ROLES, 'Etiquetas: só dono, gerente ou cozinheiro');
