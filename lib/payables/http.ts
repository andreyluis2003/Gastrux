import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { PayableError } from './rules';

/** Contas a pagar routes: owner and manager only (spec 2026-10-18 contas a pagar §5) */
export const requirePayablesAccess = () => requireRestaurantRole(MANAGER_ROLES, 'Contas a pagar são do dono e do gerente');

export function payableErrorResponse(error: unknown, what: string) {
  if (error instanceof PayableError) return NextResponse.json({ error: error.message, ...(error.extra ?? {}) }, { status: error.status });
  if (error instanceof CashRuleError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  }
  console.error(`[payables] ${what} failed:`, error);
  return NextResponse.json({ error: `Não foi possível ${what}` }, { status: 500 });
}
