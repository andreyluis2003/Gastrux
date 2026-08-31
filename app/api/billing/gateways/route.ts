// @ts-nocheck
/**
 * Public, read-only kill switch for which SaaS billing gateways the pricing
 * page should offer. Reads process.env fresh on every request (not baked
 * into the client bundle), so BILLING_MP_ENABLED can be flipped in the
 * hosting panel's env vars + a process restart, with no rebuild/redeploy.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    stripe: true,
    mercadoPago: process.env.BILLING_MP_ENABLED === 'true',
  });
}
