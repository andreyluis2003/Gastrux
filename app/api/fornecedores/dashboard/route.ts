// @ts-nocheck
// Feature: Painel de Fornecedores - cotações e comparativo
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantUser = await prisma.restaurantUser.findFirst({ where: { userId: (session as any).user?.id || (session as any).id } });
    const restaurantId = restaurantUser?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 404 });

    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId },
      include: {
        ingredients: {
          include: { ingredient: { select: { name: true, referenceCost: true } } },
          where: { active: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Price trends (last 90 days)
    const trendStart = new Date();
    trendStart.setDate(trendStart.getDate() - 90);
    const priceTrends = await prisma.priceTrend.findMany({
      where: { restaurantId, recordedDate: { gte: trendStart } },
      include: { ingredient: { select: { name: true } } },
      orderBy: { recordedDate: 'desc' },
      take: 100,
    });

    // Build price comparison matrix
    const ingredientPrices: Record<string, { name: string; suppliers: { supplierName: string; price: number }[] }> = {};
    for (const sup of suppliers) {
      for (const is of sup.ingredients) {
        if (!ingredientPrices[is.ingredientId]) {
          ingredientPrices[is.ingredientId] = { name: is.ingredient.name, suppliers: [] };
        }
        ingredientPrices[is.ingredientId].suppliers.push({ supplierName: sup.name, price: is.unitPrice });
      }
    }

    // Alerts: ingredients with price increase > 10%
    const priceAlerts: any[] = [];
    for (const [ingId, data] of Object.entries(ingredientPrices)) {
      if (data.suppliers.length >= 2) {
        const prices = data.suppliers.map((s) => s.price).sort((a, b) => a - b);
        const cheapest = prices[0];
        const expensive = prices[prices.length - 1];
        if (expensive > cheapest * 1.2) {
          priceAlerts.push({ ingredient: data.name, cheapest, expensive, diff: Math.round(((expensive - cheapest) / cheapest) * 100) });
        }
      }
    }

    return NextResponse.json({
      suppliers: suppliers.map((s) => ({
        id: s.id, name: s.name, cnpj: s.cnpj, phone: s.phone, email: s.email,
        status: s.status, ingredientCount: s.ingredients.length,
        contactPerson: s.contactPerson,
      })),
      priceComparison: Object.values(ingredientPrices).filter((p) => p.suppliers.length > 1),
      priceAlerts,
      totalSuppliers: suppliers.length,
      totalIngredientLinks: suppliers.reduce((s, sup) => s + sup.ingredients.length, 0),
    });
  } catch (error) {
    console.error('Error fetching supplier dashboard:', error);
    return NextResponse.json({ error: 'Erro ao carregar painel' }, { status: 500 });
  }
}
