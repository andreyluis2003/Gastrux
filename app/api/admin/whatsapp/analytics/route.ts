// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '30', 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // 1. Conversas totais e por estado
    const [totalConversations, conversationsByState, recentConversations] = await Promise.all([
      prisma.whatsAppConversation.count({ where: { restaurantId } }),
      prisma.whatsAppConversation.groupBy({
        by: ['state'],
        where: { restaurantId },
        _count: { state: true },
      }),
      prisma.whatsAppConversation.count({
        where: { restaurantId, createdAt: { gte: since } },
      }),
    ]);

    // 2. Mensagens — volume e response time proxy
    const [totalMessages, messagesByDirection, messagesByDay] = await Promise.all([
      prisma.whatsAppMessage.count({
        where: { conversation: { restaurantId }, createdAt: { gte: since } },
      }),
      prisma.whatsAppMessage.groupBy({
        by: ['direction'],
        where: { conversation: { restaurantId }, createdAt: { gte: since } },
        _count: { direction: true },
      }),
      prisma.$queryRaw`
        SELECT DATE(wm."createdAt") as day, COUNT(*)::int as count
        FROM whatsapp_messages wm
        JOIN whatsapp_conversations wc ON wc.id = wm."conversationId"
        WHERE wc."restaurantId" = ${restaurantId}
          AND wm."createdAt" >= ${since}
        GROUP BY DATE(wm."createdAt")
        ORDER BY day ASC
      `,
    ]);

    // 3. Funil de conversão (conversas que viraram pedido)
    const completedConversations = await prisma.whatsAppConversation.count({
      where: { restaurantId, state: 'COMPLETED' },
    });
    const conversationsWithOrder = await prisma.whatsAppConversation.count({
      where: { restaurantId, orderSessionId: { not: null } },
    });
    const humanHandoffs = await prisma.whatsAppConversation.count({
      where: { restaurantId, state: 'HUMAN_HANDOFF' },
    });

    // 4. Funil detalhado — quantas passaram por cada estado
    const funnelStates = [
      'GREETING', 'MENU_BROWSING', 'CART_REVIEW',
      'ORDER_TYPE', 'COLLECTING_INFO', 'CONFIRMING', 'COMPLETED',
    ];
    const stateMap: Record<string, number> = {};
    conversationsByState.forEach((s: any) => {
      stateMap[s.state] = s._count.state;
    });

    // Para funil acumulativo: cada conversa que chegou a estado X também passou pelos anteriores
    // Mas como armazenamos só estado ATUAL, fazemos contagem acumulativa reversa
    const funnel = funnelStates.map((state) => ({
      state,
      count: stateMap[state] || 0,
    }));

    // 5. Tempo médio de resposta (proxy: diferença entre msgs consecutivas in/out na mesma conversa)
    const avgResponseTime = await prisma.$queryRaw`
      WITH msg_pairs AS (
        SELECT 
          wm."conversationId",
          wm.direction,
          wm."createdAt",
          LAG(wm."createdAt") OVER (PARTITION BY wm."conversationId" ORDER BY wm."createdAt") as prev_at,
          LAG(wm.direction) OVER (PARTITION BY wm."conversationId" ORDER BY wm."createdAt") as prev_dir
        FROM whatsapp_messages wm
        JOIN whatsapp_conversations wc ON wc.id = wm."conversationId"
        WHERE wc."restaurantId" = ${restaurantId}
          AND wm."createdAt" >= ${since}
      )
      SELECT 
        COALESCE(AVG(EXTRACT(EPOCH FROM ("createdAt" - prev_at))), 0)::float as avg_seconds,
        COUNT(*)::int as pairs
      FROM msg_pairs
      WHERE direction = 'OUTBOUND' AND prev_dir = 'INBOUND'
    `;

    // 6. Top horários de mensagens
    const messagesByHour = await prisma.$queryRaw`
      SELECT EXTRACT(HOUR FROM wm."createdAt")::int as hour, COUNT(*)::int as count
      FROM whatsapp_messages wm
      JOIN whatsapp_conversations wc ON wc.id = wm."conversationId"
      WHERE wc."restaurantId" = ${restaurantId}
        AND wm.direction = 'INBOUND'
        AND wm."createdAt" >= ${since}
      GROUP BY EXTRACT(HOUR FROM wm."createdAt")
      ORDER BY hour ASC
    `;

    // 7. Pedidos via WhatsApp (valor)
    const waOrders = await prisma.$queryRaw`
      SELECT 
        COUNT(os.id)::int as total_orders,
        COALESCE(SUM(os.total), 0)::float as total_revenue,
        COALESCE(AVG(os.total), 0)::float as avg_ticket
      FROM order_sessions os
      JOIN whatsapp_conversations wc ON wc."orderSessionId" = os.id
      WHERE wc."restaurantId" = ${restaurantId}
        AND os."createdAt" >= ${since}
    `;

    // 8. Conversas por dia
    const conversationsByDay = await prisma.$queryRaw`
      SELECT DATE("createdAt") as day, COUNT(*)::int as count
      FROM whatsapp_conversations
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `;

    // Calcular taxas
    const conversionRate = totalConversations > 0
      ? ((conversationsWithOrder / totalConversations) * 100).toFixed(1)
      : '0.0';
    const handoffRate = totalConversations > 0
      ? ((humanHandoffs / totalConversations) * 100).toFixed(1)
      : '0.0';
    const completionRate = totalConversations > 0
      ? ((completedConversations / totalConversations) * 100).toFixed(1)
      : '0.0';

    const inbound = messagesByDirection.find((m: any) => m.direction === 'INBOUND')?._count?.direction || 0;
    const outbound = messagesByDirection.find((m: any) => m.direction === 'OUTBOUND')?._count?.direction || 0;
    const avgRespSec = (avgResponseTime as any[])?.[0]?.avg_seconds || 0;
    const orders = (waOrders as any[])?.[0] || { total_orders: 0, total_revenue: 0, avg_ticket: 0 };

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      overview: {
        totalConversations,
        recentConversations,
        completedConversations,
        conversationsWithOrder,
        humanHandoffs,
        conversionRate: parseFloat(conversionRate),
        handoffRate: parseFloat(handoffRate),
        completionRate: parseFloat(completionRate),
      },
      messages: {
        total: totalMessages,
        inbound,
        outbound,
        avgResponseTimeSec: Math.round(avgRespSec),
        byDay: messagesByDay,
        byHour: messagesByHour,
      },
      orders: {
        total: orders.total_orders,
        revenue: orders.total_revenue,
        avgTicket: orders.avg_ticket,
      },
      funnel,
      conversationsByState: stateMap,
      conversationsByDay,
    });
  } catch (err: any) {
    console.error('[whatsapp-analytics] error:', err?.message || err);
    return NextResponse.json({ error: 'Erro ao buscar analytics' }, { status: 500 });
  }
}
