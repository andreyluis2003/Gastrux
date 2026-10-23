// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { parseStaffPay } from '@/lib/staff/pay';

export const dynamic = 'force-dynamic';

/**
 * Edit the pay of a staff member from Equipe e acessos (2026-10-23): commission rule, base salary and
 * default hours. It checked the global session role and wrote any field unvalidated (role and status
 * too); nothing called it, so the rule chosen when adding the person could never change.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Mudar a remunera\u00e7\u00e3o da equipe exige um gerente');
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const owned = await prisma.staffMember.findFirst({
    where: { id: params.id, restaurantId: member.restaurantId },
    select: { id: true, commissionType: true, commissionValue: true, basesalary: true, defaultStartTime: true, defaultEndTime: true },
  });
  if (!owned) return NextResponse.json({ error: 'Funcion\u00e1rio n\u00e3o encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseStaffPay(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await prisma.staffMember.update({ where: { id: owned.id }, data: parsed.data });
  await recordAudit(member, {
    action: 'UPDATE',
    entityType: 'StaffMember',
    entityId: owned.id,
    changes: {
      before: { commissionType: owned.commissionType, commissionValue: owned.commissionValue, baseSalary: owned.basesalary, defaultStartTime: owned.defaultStartTime, defaultEndTime: owned.defaultEndTime },
      after: parsed.data,
    },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['OWNER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Sem permiss\u00e3o' }, { status: 403 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 403 });

  const owned = await prisma.staffMember.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Funcion\u00e1rio n\u00e3o encontrado' }, { status: 404 });

  await prisma.staffMember.update({
    where: { id: params.id },
    data: { status: 'TERMINATED' },
  });

  return NextResponse.json({ success: true });
}
