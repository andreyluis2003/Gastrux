import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Retired. It took an order's ingredients out of stock on every call, on top of the deduction the
 * kitchen already makes when the order is completed (lib/kds/order-status.ts), so each call counted
 * the same order again. Nothing in the app called it.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'O estoque é baixado automaticamente quando a cozinha conclui o pedido', code: 'GONE' },
    { status: 410 }
  );
}
