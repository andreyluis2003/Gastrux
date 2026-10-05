import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { listRegisters } from '@/lib/caixa/sessions';
import { CASHIER_PLUS, MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** GET /api/caixa/registers - the restaurant's active registers and the open shift of each. */
export async function GET() {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    // The caller's role in this restaurant: the screen hides manager-only buttons (the server still checks)
    return NextResponse.json({ registers: await listRegisters(auth.member.restaurantId), role: auth.member.role });
  } catch (error) {
    return cashErrorResponse(error, 'list registers');
  }
}

/** POST /api/caixa/registers { name } - a new named register (manager). */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'Criar caixa exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 40);
  if (name.length < 2) return NextResponse.json({ error: 'Informe o nome do caixa' }, { status: 400 });
  const register = await prisma.cashRegister.create({ data: { restaurantId: auth.member.restaurantId, name } });
  await recordAudit(auth.member, { action: 'CREATE', entityType: 'CashRegister', entityId: register.id, changes: { name } });
  return NextResponse.json({ register }, { status: 201 });
}

export const POST = idempotent(handlePOST);
