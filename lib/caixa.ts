// @ts-nocheck
/**
 * Cash Register Management Utilities
 */

import { CashMovementType } from '@prisma/client';

export interface CashMovement {
  type: CashMovementType;
  amount: number;
  description?: string;
  reference?: string;
}

/**
 * Calculate expected balance based on movements
 */
export function calculateExpectedBalance(
  openingBalance: number,
  movements: CashMovement[]
): number {
  let balance = openingBalance;

  for (const movement of movements) {
    const isDebit = ['WITHDRAWAL', 'REFUND'].includes(movement.type);
    if (isDebit) {
      balance -= movement.amount;
    } else {
      balance += movement.amount;
    }
  }

  return balance;
}

/**
 * Format cash balance for display
 */
export function formatCashBalance(balance: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(balance);
}

/**
 * Check if cash register is balanced
 */
export function isCashBalanced(
  expectedBalance: number,
  actualBalance: number,
  tolerance: number = 0.01
): boolean {
  return Math.abs(expectedBalance - actualBalance) <= tolerance;
}

/**
 * Calculate difference between expected and actual
 */
export function calculateCashDifference(
  expectedBalance: number,
  actualBalance: number
): number {
  return actualBalance - expectedBalance;
}
