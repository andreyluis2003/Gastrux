// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;
  if (!restaurantId) return NextResponse.json({ shifts: [] });

  const startDate = req.nextUrl.searchParams.get('start') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = req.nextUrl.searchParams.get('end') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const shifts = await prisma.staffShift.findMany({
    where: {
      staffMember: { restaurantId },
      shiftDate: { gte: new Date(startDate), lte: new Date(endDate) },
    },
    include: {
      staffMember: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: { shiftDate: 'asc' },
  });

  return NextResponse.json({ shifts });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Sem permiss\u00e3o' }, { status: 403 });
  }

  const body = await req.json();
  const { staffMemberId, shiftDate, startTime, endTime, shiftType, notes } = body;

  if (!staffMemberId || !shiftDate || !startTime || !endTime) {
    return NextResponse.json({ error: 'Campos obrigat\u00f3rios: staffMemberId, shiftDate, startTime, endTime' }, { status: 400 });
  }

  const shift = await prisma.staffShift.upsert({
    where: { staffMemberId_shiftDate: { staffMemberId, shiftDate: new Date(shiftDate) } },
    update: { startTime, endTime, shiftType: shiftType || 'NORMAL', notes },
    create: { staffMemberId, shiftDate: new Date(shiftDate), startTime, endTime, shiftType: shiftType || 'NORMAL', notes },
  });

  return NextResponse.json({ shift }, { status: 201 });
}
