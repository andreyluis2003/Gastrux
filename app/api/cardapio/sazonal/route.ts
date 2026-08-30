// @ts-nocheck
// Feature: Cardápio Sazonal — Programação de cardápios por dia/período
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET: List all menu items with their availability schedule
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ categories: [] });

    const categories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId },
      include: {
        items: {
          where: { active: true },
          include: { images: { take: 1, where: { isPublic: true } } },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching seasonal menu:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// PUT: Toggle item availability or batch update
// Body: { items: [{ id, available, displayOnWeb, displayOnQR }] }
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Sem restaurante' }, { status: 400 });

    const { items } = await req.json();
    if (!items?.length) return NextResponse.json({ error: 'Items obrigatórios' }, { status: 400 });

    const results: any[] = [];
    for (const item of items) {
      const data: any = {};
      if (item.available !== undefined) data.available = item.available;
      if (item.displayOnWeb !== undefined) data.displayOnWeb = item.displayOnWeb;
      if (item.displayOnQR !== undefined) data.displayOnQR = item.displayOnQR;
      if (item.active !== undefined) data.active = item.active;

      // Scope update to items belonging to the current restaurant only
      const upd = await prisma.menuItem.updateMany({ where: { id: item.id, restaurantId }, data });
      if (upd.count > 0) {
        const updated = await prisma.menuItem.findUnique({ where: { id: item.id } });
        if (updated) results.push({ id: updated.id, name: updated.name, available: updated.available });
      }
    }

    return NextResponse.json({ success: true, updated: results });
  } catch (error) {
    console.error('Error updating seasonal menu:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}
