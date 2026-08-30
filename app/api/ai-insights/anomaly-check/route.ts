// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { detectAnomalies } from '@/lib/ai/gather-restaurant-data';
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
    const isInternal = req.headers.get('x-internal-trigger') === process.env.CRON_SECRET;
    let restaurantId: string | null = null;
    let userId: string | null = null;

    if (isInternal) {
      // Process all active restaurants
      const restaurants = await prisma.restaurant.findMany({
        where: { active: true },
        select: { id: true },
      });
      const results = [];
      for (const r of restaurants) {
        try {
          const result = await checkAndNotify(r.id, null);
          results.push({ restaurantId: r.id, success: true, ...result });
        } catch (err: any) {
          console.error(`[anomaly-check] Error for ${r.id}:`, err?.message);
          results.push({ restaurantId: r.id, success: false, error: err?.message });
        }
      }
      return NextResponse.json({ processed: results.length, results });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    userId = (session.user as any).id;
    restaurantId = await getRestaurantId(userId);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const result = await checkAndNotify(restaurantId, userId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[anomaly-check] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

// Also support GET for dashboard polling
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;
    const restaurantId = await getRestaurantId(userId);
    if (!restaurantId) return NextResponse.json({ anomalies: [] });

    // Return latest undismissed anomaly alerts
    const alerts = await prisma.aIInsight.findMany({
      where: {
        type: 'ANOMALY_ALERT',
        dismissed: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        tags: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ anomalies: alerts });
  } catch (error: any) {
    console.error('[anomaly-check GET] Error:', error);
    return NextResponse.json({ anomalies: [] });
  }
}

async function checkAndNotify(restaurantId: string, userId: string | null) {
  const anomalies = await detectAnomalies(restaurantId);

  if (anomalies.length === 0) {
    return { anomalyCount: 0, alerts: [] };
  }

  // Generate human-readable alert via LLM
  const anomalyText = anomalies.map((a, i) => `${i + 1}. [${a.severity}] ${a.type}: ${a.message} (valor: ${a.value}, ref: ${a.reference})`).join('\n');

  const alertSummary = await callLLM([
    { role: 'system', content: 'Você é o Gastrux. Resuma as anomalias detectadas de forma clara e acionável para o dono do restaurante. Use emojis. Máximo 500 caracteres.' },
    { role: 'user', content: `Anomalias detectadas:\n${anomalyText}` },
  ], { maxTokens: 400, temperature: 0.3 });

  // Save each anomaly as insight
  const savedAlerts = [];
  for (const anomaly of anomalies) {
    const insight = await prisma.aIInsight.create({
      data: {
        type: 'ANOMALY_ALERT',
        title: `Alerta: ${anomaly.type}`,
        summary: anomaly.message,
        content: alertSummary,
        dataSnapshot: anomaly as any,
        timeRange: 'instant',
        score: anomaly.severity === 'critical' ? 90 : anomaly.severity === 'warning' ? 60 : 30,
        tags: ['alerta', anomaly.type.toLowerCase(), anomaly.severity],
        restaurantId,
        ...(userId ? { createdById: userId } : {}),
      },
    });
    savedAlerts.push(insight);
  }

  // Send WhatsApp if enabled
  let whatsappSent = false;
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { alertsWhatsappEnabled: true, dailySummaryPhone: true, whatsappConfig: true },
  });

  if (
    restaurant?.alertsWhatsappEnabled &&
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
        text: `🚨 *Alerta Gastrux*\n\n${alertSummary}`,
      });
      whatsappSent = true;
    } catch (err: any) {
      console.error('[anomaly-check] WhatsApp send failed:', err?.message);
    }
  }

  return { anomalyCount: anomalies.length, alerts: savedAlerts.map(a => a.id), whatsappSent };
}
