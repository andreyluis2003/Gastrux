// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const list = await prisma.shoppingList.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        items: {
          include: {
            supplier: {
              include: {
                ingredient: {
                  include: {
                    category: true,
                    currentStock: true,
                  },
                },
              },
            },
          },
          orderBy: { priority: 'desc' },
        },
      },
    });

    if (!list) {
      return NextResponse.json(
        { error: 'Lista não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(list);
  } catch (error) {
    console.error('Error fetching shopping list:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar lista' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session?.user || user?.role === 'COOK') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedList = await prisma.shoppingList.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedList) {
      return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
    }

    const body = await req.json();

    const list = await prisma.shoppingList.update({
      where: { id: params.id },
      data: {
        status: body.status,
        notes: body.notes,
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
        action: 'UPDATE',
        entityType: 'ShoppingList',
        entityId: list.id,
        changes: JSON.stringify({ status: body.status }),
      },
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error('Error updating shopping list:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar lista' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session?.user || user?.role === 'COOK') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedList = await prisma.shoppingList.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedList) {
      return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
    }

    const body = await req.json();
    const { itemId, checked } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: 'itemId é obrigatório' },
        { status: 400 }
      );
    }

    await prisma.shoppingListItem.updateMany({
      where: { id: itemId, shoppingListId: params.id },
      data: { checked },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar item' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session?.user || user?.role === 'COOK') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array é obrigatório e não pode estar vazio' },
        { status: 400 }
      );
    }

    // Validar que a lista existe e pertence ao tenant
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const list = await prisma.shoppingList.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!list) {
      return NextResponse.json(
        { error: 'Lista não encontrada' },
        { status: 404 }
      );
    }

    // Criar os itens
    const createdItems = await Promise.all(
      items.map((item: any) =>
        prisma.shoppingListItem.create({
          data: {
            restaurantId,
            shoppingListId: params.id,
            ingredientId: item.ingredientId || null,
            supplierId: item.supplierId || null,
            quantity: item.quantity,
            unit: item.unit,
            estimatedCost: item.estimatedCost,
            priority: item.priority || 'MEDIUM',
            notes: item.notes || null,
          },
          include: {
            supplier: {
              include: {
                ingredient: {
                  include: {
                    category: true,
                    currentStock: true,
                  },
                },
              },
            },
          },
        })
      )
    );

    // Calcular novo custo total
    const totalCost = await prisma.shoppingListItem.aggregate({
      where: { shoppingListId: params.id },
      _sum: { estimatedCost: true },
    });

    // Atualizar custo total da lista
    const updatedList = await prisma.shoppingList.update({
      where: { id: params.id },
      data: {
        totalCost: totalCost._sum.estimatedCost || 0,
      },
      include: {
        items: {
          include: {
            supplier: {
              include: {
                ingredient: {
                  include: {
                    category: true,
                    currentStock: true,
                  },
                },
              },
            },
          },
          orderBy: { priority: 'desc' },
        },
      },
    });

    // Registrar auditoria
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'ShoppingList',
        entityId: list.id,
        changes: JSON.stringify({ addedItems: items.length, itemCount: createdItems.length }),
      },
    });

    return NextResponse.json(updatedList, { status: 201 });
  } catch (error) {
    console.error('Error adding items to shopping list:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar itens à lista de compras' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session?.user || user?.role === 'COOK') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedList = await prisma.shoppingList.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedList) {
      return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
    }

    // Primeiro, deletar todos os itens da lista
    await prisma.shoppingListItem.deleteMany({
      where: { shoppingListId: params.id },
    });

    // Depois, deletar a lista
    const list = await prisma.shoppingList.delete({
      where: { id: params.id },
    });

    // Registrar auditoria
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entityType: 'ShoppingList',
        entityId: list.id,
        changes: JSON.stringify({ deletedAt: new Date() }),
      },
    });

    return NextResponse.json({ success: true, message: 'Lista de compras deletada com sucesso' });
  } catch (error) {
    console.error('Error deleting shopping list:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar lista de compras' },
      { status: 500 }
    );
  }
}
