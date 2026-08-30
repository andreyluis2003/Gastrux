// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Sem permiss\u00e3o' }, { status: 403 });
  }

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

  await prisma.staffMember.update({
    where: { id: params.id },
    data: { status: 'TERMINATED' },
  });

  return NextResponse.json({ success: true });
}
