import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { MANAGER_PLUS } from '@/lib/caixa/roles';

export const dynamic = 'force-dynamic';

/** PATCH /api/caixa/registers/[id] { name?, active? } - rename or deactivate (never with an open shift). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'Alterar caixa exige um gerente');
  if (!auth.ok) return auth.response;
  const register = await prisma.cashRegister.findFirst({ where: { id: params.id, restaurantId: auth.member.restaurantId } });
  if (!register) return NextResponse.json({ error: 'Caixa não encontrado' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const data: { name?: string; active?: boolean } = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (name.length < 2) return NextResponse.json({ error: 'Informe o nome do caixa' }, { status: 400 });
    data.name = name;
  }
  if (body?.active === false) {
    if (register.isDefault) return NextResponse.json({ error: 'O caixa principal não pode ser desativado' }, { status: 409 });
    const open = await prisma.cashSession.count({ where: { cashRegisterId: register.id, status: 'OPEN' } });
    if (open) return NextResponse.json({ error: 'Feche o turno antes de desativar este caixa' }, { status: 409 });
    data.active = false;
  } else if (body?.active === true) {
    data.active = true;
  }
  const updated = await prisma.cashRegister.update({ where: { id: register.id }, data });
  await recordAudit(auth.member, { action: 'UPDATE', entityType: 'CashRegister', entityId: register.id, changes: data });
  return NextResponse.json({ register: updated });
}
