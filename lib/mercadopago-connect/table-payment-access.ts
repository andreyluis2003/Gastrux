import { prisma } from '@/lib/prisma';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { hasActiveConnection } from './connection-service';

/** Shown to the table when the restaurant does not take payments at the table */
export const TABLE_PAYMENT_UNAVAILABLE = 'O pagamento pela mesa não está disponível neste restaurante. Peça a conta ao garçom.';

/** Pay at the table is a Pro, Business and Enterprise feature (owner, 2026-10-12) */
export async function tablePaymentPlanAllows(restaurantId: string): Promise<boolean> {
  return isTierFeatureEnabled(await restaurantTier(restaurantId), 'tablePayment');
}

/** The plan allows it AND the restaurant's Mercado Pago is connected: only then the menu shows the pay button */
export async function tablePaymentEnabled(restaurantId: string): Promise<boolean> {
  return (await tablePaymentPlanAllows(restaurantId)) && (await hasActiveConnection(restaurantId));
}
