// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;
  if (!restaurantId) return NextResponse.json({ members: [] });

  const members = await prisma.staffMember.findMany({
    where: { restaurantId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      shifts: { where: { shiftDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, orderBy: { shiftDate: 'desc' }, take: 7 },
      commissions: { orderBy: { period: 'desc' }, take: 3 },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Sem permiss\u00e3o' }, { status: 403 });
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 404 });

  const body = await req.json();
  const { name, email, phone, cpf, staffRole, baseSalary, commissionType, commissionValue, defaultStartTime, defaultEndTime } = body;

  if (!name || !email) {
    return NextResponse.json({ error: 'Nome e email s\u00e3o obrigat\u00f3rios' }, { status: 400 });
  }

  // Check/create user
  let staffUser = await prisma.user.findUnique({ where: { email } });
  if (!staffUser) {
    const bcrypt = await import('bcryptjs');
    staffUser = await prisma.user.create({
      data: {
        email, name, password: await bcrypt.hash('temp123', 10),
        role: staffRole || 'COOK', active: true,
      },
    });
  }

  // Link to restaurant
  await prisma.restaurantUser.upsert({
    where: { restaurantId_userId: { restaurantId, userId: staffUser.id } },
    update: { role: staffRole || 'COOK', isActive: true },
    create: { restaurantId, userId: staffUser.id, role: staffRole || 'COOK', permissions: [], acceptedAt: new Date() },
  });

  // Create staff member
  const member = await prisma.staffMember.upsert({
    where: { userId: staffUser.id },
    update: {
      phone, cpf, role: staffRole || 'COOK', status: 'ACTIVE',
      basesalary: baseSalary || null,
      commissionType: commissionType || 'PERCENTAGE',
      commissionValue: commissionValue || null,
      defaultStartTime: defaultStartTime || '08:00',
      defaultEndTime: defaultEndTime || '18:00',
    },
    create: {
      restaurantId, userId: staffUser.id, phone, cpf,
      role: staffRole || 'COOK', status: 'ACTIVE',
      basesalary: baseSalary || null,
      commissionType: commissionType || 'PERCENTAGE',
      commissionValue: commissionValue || null,
      defaultStartTime: defaultStartTime || '08:00',
      defaultEndTime: defaultEndTime || '18:00',
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}
