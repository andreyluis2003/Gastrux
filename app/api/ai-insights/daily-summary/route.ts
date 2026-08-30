// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { gatherDailySummary } from '@/lib/ai/gather-restaurant-data';
import { callLLM } from '@/lib/ai/llm-client';
import { MetaCloudClient } from '@/lib/whatsapp/meta-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getRestaurantId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  return u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId || null;
}

export async function POST(req: NextRequest) {
  try {
    // Auth: session OR cron
    const isInternal = req.headers.get('x-internal-trigger') === process.env.CRON_SECRET;
    let restaurantId: string | null = null;
    let userId: string | null = null;

    if (isInternal) {
      // Cron mode: process all restaurants with dailySummaryEnabled
      const restaurants = await prisma.restaurant.findMany({
        where: { dailySummaryEnabled: true, active: true },
        select: { id: true },
      });
      const results = [];
      for (const r of restaurants) {
        try {
          const result = await generateAndSendSummary(r.id, null);
          results.push({ restaurantId: r.id, success: true, ...result });
        } catch (err: any) {
          console.error(`[daily-summary] Error for restaurant ${r.id}:`, err?.message);
          results.push({ restaurantId: r.id, success: false, error: err?.message });
        }
      }
      return NextResponse.json({ processed: results.length, results });
    }

    // Session auth
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    userId = (session.user as any).id;
    restaurantId = await getRestaurantId(userId);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const result = await generateAndSendSummary(restaurantId, userId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[daily-summary] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

async function generateAndSendSummary(restaurantId: string, userId: string | null) {
  const data = await gatherDailySummary(restaurantId);

  const prompt = `Você é o Gastrux, assistente inteligente de gestão de restaurantes.
Gere um resumo diário conciso e acionável para o dono do restaurante "${data.restaurantName}".

Dados do dia (${data.date}):
- Faturamento: R$ ${data.revenue.toFixed(2)}
- Pedidos: ${data.orderCount}
- Ticket médio: R$ ${data.avgTicket.toFixed(2)}
- CMV: ${data.cmvPercent != null ? data.cmvPercent.toFixed(1) + '%' : 'N/A'}
- Top vendidos: ${data.topSellingItems.map(i => `${i.name} (${i.qty}x, R$${i.revenue.toFixed(2)})`).join(', ') || 'Sem dados'}
- Item mais lucrativo: ${data.mostProfitableItem ? `${data.mostProfitableItem.name} (margem ${data.mostProfitableItem.margin.toFixed(1)}%)` : 'N/A'}
- Item menos lucrativo: ${data.leastProfitableItem ? `${data.leastProfitableItem.name} (margem ${data.leastProfitableItem.margin.toFixed(1)}%)` : 'N/A'}
- Ingredientes com estoque baixo: ${data.lowStockIngredients.map(i => `${i.name} (${i.current}/${i.minimum} ${i.unit})`).join(', ') || 'Nenhum'}
- Alertas de preço: ${data.priceAlerts.map(a => `${a.ingredient} (${a.changePercent > 0 ? '+' : ''}${a.changePercent.toFixed(1)}%)`).join(', ') || 'Nenhum'}

Regras:
1. Use emojis moderadamente para facilitar leitura no WhatsApp
2. Destaque pontos de atenção e oportunidades
3. Mantenha tom profissional mas acessível
4. Limite a 800 caracteres
5. Termine com uma dica acionável`;

  const summary = await callLLM([
    { role: 'system', content: 'Você é o Gastrux, assistente de gestão gastronômica. Responda sempre em português do Brasil.' },
    { role: 'user', content: prompt },
  ], { maxTokens: 600, temperature: 0.5 });

  // Save as AI Insight
  const insight = await prisma.aIInsight.create({
    data: {
      type: 'DAILY_SUMMARY',
      title: `Resumo Diário - ${data.date}`,
      summary: summary.substring(0, 300),
      content: summary,
      dataSnapshot: data as any,
      timeRange: 'daily',
      score: 0,
      tags: ['resumo-diario', 'automatico'],
      restaurantId,
      ...(userId ? { createdById: userId } : {}),
    },
  });

  // Send via WhatsApp if configured
  let whatsappSent = false;
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { dailySummaryEnabled: true, dailySummaryPhone: true, whatsappConfig: true },
  });

  if (
    restaurant?.dailySummaryEnabled &&
    restaurant?.dailySummaryPhone &&
    restaurant?.whatsappConfig?.isActive &&
    restaurant?.whatsappConfig?.phoneNumberId &&
    restaurant?.whatsappConfig?.accessToken
  ) {
    try {
      const client = new MetaCloudClient({
        phoneNumberId: restaurant.whatsappConfig.phoneNumberId,
        accessToken: restaurant.whatsappConfig.accessToken,
      });
      await client.sendText({
        to: restaurant.dailySummaryPhone,
        text: `📊 *Resumo Diário Gastrux*\n\n${summary}`,
      });
      whatsappSent = true;
    } catch (err: any) {
      console.error('[daily-summary] WhatsApp send failed:', err?.message);
    }
  }

  return { insightId: insight.id, summary, whatsappSent };
}
