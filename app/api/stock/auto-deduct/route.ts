// Feature #6: Dedução automática de estoque ao completar pedido
// POST /api/stock/auto-deduct { orderId }
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'orderId obrigat\u00f3rio' }, { status: 400 });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            recipe: {
              include: {
                ingredients: {
                  include: { ingredient: true },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return NextResponse.json({ error: 'Pedido n\u00e3o encontrado' }, { status: 404 });

    const deductions: { ingredientId: string; ingredientName: string; quantity: number; unit: string }[] = [];

    for (const item of order.items) {
      if (!item.recipe?.ingredients) continue;
      for (const ri of item.recipe.ingredients) {
        const qty = ri.quantity * item.quantity;
        deductions.push({
          ingredientId: ri.ingredientId,
          ingredientName: ri.ingredient.name,
          quantity: qty,
          unit: ri.unit,
        });
      }
    }

    // Aggregate deductions by ingredient
    const aggregated = new Map<string, { total: number; name: string; unit: string }>();
    for (const d of deductions) {
      const existing = aggregated.get(d.ingredientId);
      if (existing) {
        existing.total += d.quantity;
      } else {
        aggregated.set(d.ingredientId, { total: d.quantity, name: d.ingredientName, unit: d.unit });
      }
    }

    const results: any[] = [];
    for (const [ingredientId, data] of aggregated) {
      // Update stock
      const stock = await prisma.stock.findFirst({ where: { ingredientId } });
      if (stock) {
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            currentQuantity: { decrement: data.total },
            lastUpdated: new Date(),
          },
        });
      }

      // Create movement record
      await prisma.stockMovement.create({
        data: {
          restaurantId: order.restaurantId,
          ingredientId,
          quantity: -data.total,
          movementType: 'AUTO_DEDUCTION',
          reason: `Pedido #${order.orderNumber}`,
          referenceId: order.id,
          referenceType: 'ORDER',
        },
      });

      results.push({ ingredient: data.name, deducted: data.total, unit: data.unit });
    }

    return NextResponse.json({ success: true, deductions: results, orderId: order.id });
  } catch (error) {
    console.error('Error auto-deducting stock:', error);
    return NextResponse.json({ error: 'Erro ao deduzir estoque' }, { status: 500 });
  }
}
