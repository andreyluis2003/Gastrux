import { NextResponse } from 'next/server';
import { requireRestaurantRole, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { deleteWeeklyMenu, getWeeklyMenu, updateWeeklyMenu } from '@/lib/weekly-menu/service';

export const dynamic = 'force-dynamic';
const DENIED = 'Alterar o cardápio exige um gerente';
type Ctx = { params: { id: string } };

function fail(e: unknown) {
  if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getWeeklyMenu(auth.member.restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}

/** PUT { orderDeadline?, items } */
export async function PUT(req: Request, { params }: Ctx) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await updateWeeklyMenu(auth.member.restaurantId, params.id, body ?? {}));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    await deleteWeeklyMenu(auth.member.restaurantId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
