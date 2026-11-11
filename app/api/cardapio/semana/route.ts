import { NextResponse } from 'next/server';
import { requireRestaurantRole, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { createWeeklyMenu, listWeeklyMenus } from '@/lib/weekly-menu/service';

export const dynamic = 'force-dynamic';
const DENIED = 'Alterar o cardápio exige um gerente';

/** GET: weekly menus of the restaurant (spec 2026-11-10 cardapio-da-semana) */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ menus: await listWeeklyMenus(auth.member.restaurantId) });
}

/** POST { serviceDate, orderDeadline?, items, copyFromId? } */
export async function POST(req: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await createWeeklyMenu(auth.member.restaurantId, body ?? {}), { status: 201 });
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
