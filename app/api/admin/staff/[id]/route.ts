// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Sem permiss\u00e3o' }, { status: 403 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 403 });

  const owned = await prisma.staffMember.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Funcion\u00e1rio n\u00e3o encontrado' }, { status: 404 });

  const body = await req.json();
  const member = await prisma.staffMember.update({
    where: { id: params.id },
    data: {
      phone: body.phone,
      cpf: body.cpf,
      role: body.staffRole,
      status: body.status,
      basesalary: body.baseSalary,
      commissionType: body.commissionType,
      commissionValue: body.commissionValue,
      defaultStartTime: body.defaultStartTime,
      defaultEndTime: body.defaultEndTime,
    },
  });

  return NextResponse.json({ member });
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
