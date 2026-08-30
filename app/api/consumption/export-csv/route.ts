// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MovementType } from '@prisma/client';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const searchParams = request.nextUrl.searchParams;
    const periodDays = searchParams.get('period') || '30';
    const ingredientIdsParam = searchParams.get('ingredients');
    const movementTypesParam = searchParams.get('types');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodDays));

    const ingredientIds = ingredientIdsParam
      ? ingredientIdsParam.split(',')
      : undefined;
    const movementTypes = movementTypesParam
      ? movementTypesParam.split(',')
      : ['MANUAL_DEDUCTION'];

    const where: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      movementType: {
        in: movementTypes as MovementType[],
      },
    };

    if (ingredientIds && ingredientIds.length > 0) {
      where.ingredientId = {
        in: ingredientIds,
      };
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        ingredient: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let csv = 'Data,Ingrediente,Categoria,Tipo,Quantidade,Unidade,Custo Unitario,Custo Total\n';

    movements.forEach((m: any) => {
      const cost = (m.ingredient.referenceCost || 0) * m.quantity;
      const date = m.createdAt.toLocaleDateString('pt-BR');
      const ingredient = m.ingredient.name;
      const category = m.ingredient.category?.name || 'Sem categoria';
      const movementType = m.movementType || 'DESCONHECIDO';
      const qty = m.quantity.toFixed(2);
      const unit = m.ingredient.unit || 'un';
      const unitCost = (m.ingredient.referenceCost || 0).toFixed(2);
      const totalCost = cost.toFixed(2);
      csv += `"${date}","${ingredient}","${category}","${movementType}","${qty}","${unit}","${unitCost}","${totalCost}"\n`;
    });

    const bom = '\uFEFF';
    const response = new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="consumo-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

    return response;
  } catch (error) {
    console.error('[EXPORT CSV]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
