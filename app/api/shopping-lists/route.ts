// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const lists = await prisma.shoppingList.findMany({
      where: { restaurantId },
      include: {
        items: {
          include: {
            supplier: {
              include: { ingredient: true },
            },
          },
        },
      },
      orderBy: { listDate: 'desc' },
    });
    return NextResponse.json(lists);
  } catch (error) {
    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar listas' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role === 'COOK') {
    return NextResponse.json(
      { error: 'Sem permissão para criar listas de compras' },
      { status: 403 }
    );
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    const body = await req.json();
    const { notes, autoGenerate } = body;

    if (autoGenerate) {
      // Auto-generate based on ingredients below minimum stock
      const stocks = await prisma.stock.findMany({
        where: { restaurantId },
        include: {
          ingredient: {
            include: {
              suppliers: {
                where: { active: true },
                orderBy: { unitPrice: 'asc' },
                take: 1,
              },
            },
          },
        },
      });

      const itemsToCreate: {
        restaurantId: string;
        ingredientId: string;
        supplierId: string;
        quantity: number;
        unit: any;
        estimatedCost: number;
        priority: any;
      }[] = [];

      for (const stock of stocks) {
        const ingredient = stock.ingredient;
        if (!ingredient.active) continue;

        const minStock = ingredient.minimumStock ?? 0;
        if (stock.currentQuantity >= minStock) continue;
        if (ingredient.suppliers.length === 0) continue;

        const supplier = ingredient.suppliers[0];
        const neededQty = Math.max(minStock * 2 - stock.currentQuantity, 1);
        const priority =
          stock.currentQuantity <= 0
            ? 'HIGH'
            : stock.currentQuantity < minStock * 0.5
            ? 'HIGH'
            : 'MEDIUM';

        itemsToCreate.push({
          restaurantId,
          ingredientId: ingredient.id,
          supplierId: supplier.id,
          quantity: parseFloat(neededQty.toFixed(2)),
          unit: ingredient.standardUnit,
          estimatedCost: parseFloat((neededQty * supplier.unitPrice).toFixed(2)),
          priority: priority,
        });
      }

      if (itemsToCreate.length === 0) {
        return NextResponse.json(
          { error: 'Nenhum ingrediente abaixo do estoque mínimo encontrado' },
          { status: 400 }
        );
      }

      const totalCost = itemsToCreate.reduce(
        (sum, item) => sum + item.estimatedCost,
        0
      );

      const list = await prisma.shoppingList.create({
        data: {
          restaurantId,
          listDate: new Date(),
          notes: notes || 'Lista gerada automaticamente baseada no estoque mínimo',
          totalCost: parseFloat(totalCost.toFixed(2)),
          items: {
            create: itemsToCreate,
          },
        },
        include: {
          items: {
            include: {
              supplier: {
                include: { ingredient: true },
              },
            },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entityType: 'ShoppingList',
          entityId: list.id,
          changes: JSON.stringify({ autoGenerate: true, itemCount: itemsToCreate.length }),
        },
      });

      return NextResponse.json(list, { status: 201 });
    } else {
      // Create empty list for manual item addition
      const list = await prisma.shoppingList.create({
        data: {
          restaurantId,
          listDate: new Date(),
          notes: notes || '',
          totalCost: 0,
        },
        include: {
          items: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entityType: 'ShoppingList',
          entityId: list.id,
          changes: JSON.stringify({ autoGenerate: false }),
        },
      });

      return NextResponse.json(list, { status: 201 });
    }
  } catch (error) {
    console.error('Error creating shopping list:', error);
    return NextResponse.json(
      { error: 'Erro ao criar lista de compras' },
      { status: 500 }
    );
  }
}
