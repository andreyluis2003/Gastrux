import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { getCashbackSettings, saveCashbackSettings } from '@/lib/cashback/service';

export const dynamic = 'force-dynamic';

/** GET / PUT { enabled, percent, validityMonths, minUseCents } - the owner's cashback rule (spec 2026-10-23 §3.4) */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'O cashback é configurado pelo dono e pelo gerente');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getCashbackSettings(auth.member.restaurantId));
}

export async function PUT(req: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'O cashback é configurado pelo dono e pelo gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await saveCashbackSettings(auth.member, body));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
