import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { onboardingStatus } from '@/lib/onboarding/first-steps';
import { freeQuota } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';

/** GET /api/ai/onboarding - onboarding card of the chat, no LLM call (spec 2026-10-17 ia-implantacao §3.3) */
export async function GET() {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'A implantação é do dono e do gerente');
  if (!auth.ok) return auth.response;
  const { steps, ...status } = await onboardingStatus(auth.member.restaurantId);
  const free = await freeQuota(auth.member.restaurantId);
  return NextResponse.json({ ...status, free }, { headers: { 'Cache-Control': 'no-store' } });
}
