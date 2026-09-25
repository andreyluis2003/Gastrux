// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isPlatformAdminIdentity(session.user?.role, session.user?.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active users (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await prisma.user.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Get total emails sent
    const totalEmailsSent = await prisma.emailDeliveryLog.count({
      where: {
        sentAt: { gte: thirtyDaysAgo },
      },
    });

    // Get average delivery rate
    const deliveryLogs = await prisma.emailDeliveryLog.findMany({
      where: {
        sentAt: { gte: thirtyDaysAgo },
      },
      select: { status: true },
    });

    const delivered = deliveryLogs.filter(
      (l) => l.status !== 'FAILED' && l.status !== 'BOUNCED'
    ).length;
    const avgDeliveryRate =
      deliveryLogs.length > 0
        ? ((delivered / deliveryLogs.length) * 100).toFixed(2)
        : 0;

    // Estimate total database records
    const userCount = await prisma.user.count();
    const ingredientCount = await prisma.ingredient.count({ where: {} });
    const recipeCount = await prisma.recipe.count({ where: {} });
    const productionPlanCount = await prisma.productionPlan.count();
    const emailLogCount = await prisma.emailDeliveryLog.count();

    const dbRecordCount =
      userCount +
      ingredientCount +
      recipeCount +
      productionPlanCount +
      emailLogCount;

    // Get user growth data (last 30 days)
    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const growthData: { [key: string]: any } = {};
    let cumulative = 0;

    users.forEach((user) => {
      const dateKey = user.createdAt.toISOString().split('T')[0];
      if (!growthData[dateKey]) {
        growthData[dateKey] = { date: dateKey, signups: 0, cumulative: 0 };
      }
      growthData[dateKey].signups++;
    });

    // Calculate cumulative
    Object.keys(growthData)
      .sort()
      .forEach((dateKey) => {
        cumulative += growthData[dateKey].signups;
        growthData[dateKey].cumulative = cumulative;
      });

    // Generate recommendations based on metrics
    const recommendations = [];

    if (activeUsers > 1000) {
      recommendations.push(
        'Alto volume de usuários: Considere implementar queue de tarefas (Bull/BullMQ)'
      );
    }

    if (totalEmailsSent > 10000) {
      recommendations.push(
        'Alto volume de emails: Implemente rate limiting mais agressivo (50-100ms entre emails)'
      );
    }

    if (dbRecordCount > 1000000) {
      recommendations.push(
        'Grande volume de dados: Considere arquivar dados antigos (>90 dias)'
      );
    }

    if (activeUsers > 100 && activeUsers < 1000) {
      recommendations.push(
        'Crescimento moderado: Prepare infraestrutura para suportar 10x crescimento'
      );
    }

    return NextResponse.json(
      {
        activeUsers,
        totalEmailsSent,
        avgDeliveryRate,
        dbRecordCount: Math.floor(dbRecordCount),
        details: {
          users: userCount,
          ingredients: ingredientCount,
          recipes: recipeCount,
          productionPlans: productionPlanCount,
          emailLogs: emailLogCount,
        },
        growthData: Object.values(growthData).slice(-30),
        recommendations,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Scaling metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
