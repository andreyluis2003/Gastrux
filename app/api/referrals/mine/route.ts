import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { myReferrals } from '@/lib/referrals/mine';

export const dynamic = 'force-dynamic';

/** GET /api/referrals/mine - the owner's referral link and referred restaurants (plan 2026-10-24 indicacao, Task 7) */
export async function GET() {
  const auth = await requireRestaurantRole(['OWNER'], 'Indique e ganhe é do dono do restaurante');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await myReferrals(auth.member.restaurantId), { headers: { 'Cache-Control': 'no-store' } });
}
