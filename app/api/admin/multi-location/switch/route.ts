// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const { restaurantId } = await req.json();

  if (!restaurantId) return NextResponse.json({ error: 'restaurantId obrigat\u00f3rio' }, { status: 400 });

  // Verify user has access
  const access = await prisma.restaurantUser.findUnique({
    where: { restaurantId_userId: { restaurantId, userId } },
  });

  if (!access) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });

  await prisma.user.update({
    where: { id: userId },
    data: { currentRestaurantId: restaurantId },
  });

  return NextResponse.json({ success: true, restaurantId });
}
