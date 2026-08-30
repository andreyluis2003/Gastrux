// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const ingredients = await prisma.ingredient.findMany({
      where: { active: true },
      include: {
        category: { select: { name: true, color: true } },
        currentStock: { select: { currentQuantity: true, lastUpdated: true } },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    const items = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      code: ing.code,
      category: ing.category.name,
      categoryColor: ing.category.color,
      unit: ing.standardUnit,
      systemQuantity: ing.currentStock?.currentQuantity || 0,
      minimumStock: ing.minimumStock,
      lastUpdated: ing.currentStock?.lastUpdated,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error('Stock count error:', error);
    return NextResponse.json({ error: 'Erro ao carregar itens' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const { counts } = body; // Array of { ingredientId, countedQuantity }

    if (!counts || !Array.isArray(counts)) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const results = [];
    for (const item of counts) {
      const { ingredientId, countedQuantity } = item;
      if (!ingredientId || countedQuantity === undefined) continue;

      const stock = await prisma.stock.findUnique({ where: { ingredientId } });
      const systemQty = stock?.currentQuantity || 0;
      const difference = countedQuantity - systemQty;

      if (Math.abs(difference) > 0.01) {
        // Create adjustment movement
        await prisma.stockMovement.create({
          data: {
            ingredientId,
            quantity: Math.abs(difference),
            movementType: 'ADJUSTMENT',
            reason: `Contagem física: ${systemQty} → ${countedQuantity} (dif: ${difference > 0 ? '+' : ''}${difference.toFixed(2)})`,
          },
        });

        // Update stock
        if (stock) {
          await prisma.stock.update({
            where: { ingredientId },
            data: { currentQuantity: countedQuantity, lastUpdated: new Date() },
          });
        } else {
          await prisma.stock.create({
            data: { ingredientId, currentQuantity: countedQuantity },
          });
        }
      }

      results.push({
        ingredientId,
        systemQuantity: systemQty,
        countedQuantity,
        difference,
        adjusted: Math.abs(difference) > 0.01,
      });
    }

    const adjusted = results.filter(r => r.adjusted).length;
    return NextResponse.json({
      message: `Contagem salva: ${adjusted} itens ajustados de ${results.length} contados`,
      results,
      adjustedCount: adjusted,
      totalCounted: results.length,
    });
  } catch (error) {
    console.error('Stock count POST error:', error);
    return NextResponse.json({ error: 'Erro ao salvar contagem' }, { status: 500 });
  }
}
