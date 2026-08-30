// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callLLM } from '@/lib/ai/llm-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getRestaurantId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  return u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId || null;
}

// GET: list active combo suggestions
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;
    const restaurantId = await getRestaurantId(userId);
    if (!restaurantId) return NextResponse.json({ combos: [] });

    const combos = await prisma.aIInsight.findMany({
      where: { restaurantId, type: 'COMBO_SUGGESTION', dismissed: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ combos });
  } catch (error: any) {
    console.error('[combos GET]', error);
    return NextResponse.json({ combos: [] });
  }
}

// POST: generate new combo suggestions using AI + menu engineering data
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;
    const restaurantId = await getRestaurantId(userId);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    // Gather menu engineering data
    const recipes = await prisma.recipe.findMany({
      where: { active: true, restaurantId },
      select: {
        id: true,
        name: true,
        code: true,
        sellingPrice: true,
        costPerPortion: true,
      },
    });

    // Get latest snapshots for classification
    const snapshots = await (prisma as any).menuEngineeringSnapshot.findMany({
      where: { restaurantId },
      orderBy: { periodEnd: 'desc' },
      select: { recipeId: true, classification: true, quantitySold: true, profitMargin: true },
    });
    const classMap: Record<string, any> = {};
    for (const s of snapshots) {
      if (!classMap[s.recipeId]) classMap[s.recipeId] = s;
    }

    // Get sales co-occurrence data (items ordered together)
    const recentSessions = await prisma.orderSession.findMany({
      where: {
        status: { not: 'CANCELLED' as any },
        openedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: {
        items: { select: { recipeId: true, quantity: true } },
      },
      take: 500,
    });

    // Build co-occurrence pairs
    const pairCounts: Record<string, number> = {};
    for (const session of recentSessions) {
      const recipeIdsInSession = [...new Set(session.items.filter(i => i.recipeId).map(i => i.recipeId!))];
      for (let i = 0; i < recipeIdsInSession.length; i++) {
        for (let j = i + 1; j < recipeIdsInSession.length; j++) {
          const pair = [recipeIdsInSession[i], recipeIdsInSession[j]].sort().join('|');
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
      }
    }

    // Top co-occurring pairs
    const topPairs = Object.entries(pairCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pair, count]) => {
        const [id1, id2] = pair.split('|');
        const r1 = recipes.find(r => r.id === id1);
        const r2 = recipes.find(r => r.id === id2);
        return {
          items: [r1?.name || id1, r2?.name || id2],
          count,
          class1: classMap[id1]?.classification || 'UNKNOWN',
          class2: classMap[id2]?.classification || 'UNKNOWN',
        };
      });

    // Build recipe context
    const recipeContext = recipes.map(r => {
      const cls = classMap[r.id];
      const margin = r.sellingPrice > 0
        ? ((Number(r.sellingPrice) - r.costPerPortion) / Number(r.sellingPrice) * 100).toFixed(1)
        : '0';
      return `- ${r.name} (R$${Number(r.sellingPrice).toFixed(2)}, custo R$${r.costPerPortion.toFixed(2)}, margem ${margin}%, classe: ${cls?.classification || 'N/A'})`;
    }).join('\n');

    const pairsContext = topPairs.length > 0
      ? topPairs.map(p => `- ${p.items[0]} + ${p.items[1]} (${p.count}x juntos, classes: ${p.class1}/${p.class2})`).join('\n')
      : 'Sem dados de co-ocorrência ainda.';

    const prompt = `Você é o Gastrux, especialista em engenharia de cardápio e maximização de lucro.

Com base nos dados abaixo, sugira 3-5 combos estratégicos para o restaurante.

Receitas ativas:
${recipeContext}

Pratos mais pedidos juntos (co-ocorrência):
${pairsContext}

Regras:
1. Cada combo deve ter 2-3 itens
2. Priorize combinar STAR (popular+lucrativo) com PUZZLE (lucrativo mas pouco pedido) para aumentar vendas do Puzzle
3. O desconto do combo deve ser 5-15% sobre a soma dos preços individuais
4. Dê um nome criativo e apelativo para cada combo
5. Explique a estratégia por trás de cada combo em 1 frase

Responda APENAS em JSON válido com este formato:
{
  "combos": [
    {
      "name": "Nome do Combo",
      "description": "Descrição curta atrativa",
      "strategy": "Explicação estratégica",
      "items": [{"name": "Prato 1", "price": 29.90}, {"name": "Prato 2", "price": 15.90}],
      "originalPrice": 45.80,
      "comboPrice": 39.90,
      "discountPercent": 13
    }
  ]
}`;

    const response = await callLLM([
      { role: 'system', content: 'Você é especialista em engenharia de cardápio. Responda APENAS em JSON válido.' },
      { role: 'user', content: prompt },
    ], { maxTokens: 2000, temperature: 0.5, jsonMode: true });

    let parsed: any;
    try {
      parsed = JSON.parse(response);
    } catch {
      console.error('[combos] Failed to parse LLM response:', response);
      return NextResponse.json({ error: 'Erro ao processar resposta da IA' }, { status: 500 });
    }

    // Save each combo as AIInsight
    const savedCombos = [];
    for (const combo of (parsed.combos || [])) {
      const insight = await prisma.aIInsight.create({
        data: {
          type: 'COMBO_SUGGESTION',
          title: combo.name,
          summary: combo.description,
          content: combo.strategy || combo.description,
          dataSnapshot: {
            items: combo.items,
            originalPrice: combo.originalPrice,
            comboPrice: combo.comboPrice,
            discountPercent: combo.discountPercent,
          },
          timeRange: 'monthly',
          score: 70,
          tags: ['combo', 'automatico', 'sprint2'],
          pinned: false,
          restaurantId,
          createdById: userId,
        },
      });
      savedCombos.push({ ...combo, insightId: insight.id });
    }

    return NextResponse.json({
      generated: savedCombos.length,
      combos: savedCombos,
      coOccurrence: topPairs.slice(0, 5),
    });
  } catch (error: any) {
    console.error('[combos POST]', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
