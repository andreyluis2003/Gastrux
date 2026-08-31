// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateLeadScore } from '@/lib/marketing/lead-scoring';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/marketing/automation
 * Executa automações de nurturing:
 * - Recalcula scores
 * - Avança estágios
 * - Marca leads inativos
 * Pode ser chamado via daemon/cron ou manualmente.
 */
export async function POST(req: NextRequest) {
  // Aceita tanto session quanto CRON_SECRET
  const internalTrigger = req.headers.get('x-internal-trigger');
  const cronSecret = process.env.CRON_SECRET;

  if (internalTrigger && cronSecret && internalTrigger === cronSecret) {
    // Authenticated via cron
  } else {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ') && cronSecret && authHeader.slice(7) === cronSecret) {
      // Authenticated via bearer
    } else {
      const session = await getServerSession(authOptions);
      if (!session || !isPlatformAdminIdentity((session.user as any)?.role, (session.user as any)?.email)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }
  }

  try {
    const now = new Date();
    const results = {
      scoresUpdated: 0,
      stagesAdvanced: 0,
      markedUnresponsive: 0,
    };

    // 1. Recalcular scores de todos os leads ativos
    const activeLeads = await prisma.marketingLead.findMany();

    for (const lead of activeLeads) {
      const newScore = calculateLeadScore({
        source: lead.source,
        hasPhone: !!lead.phoneNumber,
        hasEmail: !!lead.email,
        hasBusinessName: !!lead.businessName,
        segment: lead.segment,
        utmCampaign: lead.utmCampaign,
        contactAttempts: lead.contactAttempts,
        metadata: lead.metadata as any,
      });

      if (newScore !== lead.score) {
        await prisma.marketingLead.update({
          where: { id: lead.id },
          data: { score: newScore },
        });
        results.scoresUpdated++;
      }
    }

    // 2. Marcar leads sem contato há >30 dias como UNRESPONSIVE
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const unresponsive = await prisma.marketingLead.updateMany({
      where: {
        contactAttempts: { gte: 3 },
        lastContactAt: { lt: thirtyDaysAgo },
      },
      data: { status: 'UNRESPONSIVE' },
    });
    results.markedUnresponsive = unresponsive.count;

    // 3. Avançar leads CAPTURED → WELCOME_SENT que já têm >1 dia
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const toWelcome = await prisma.marketingLead.updateMany({
      where: {
        createdAt: { lt: oneDayAgo },
        status: { notIn: ['CONVERTED', 'LOST', 'UNRESPONSIVE'] },
      },
      data: { stage: 'WELCOME_SENT' },
    });
    results.stagesAdvanced += toWelcome.count;

    // 4. Leads com score alto e WELCOME_SENT → ENGAGED
    const toEngaged = await prisma.marketingLead.updateMany({
      where: {
        score: { gte: 50 },
        status: { notIn: ['CONVERTED', 'LOST', 'UNRESPONSIVE'] },
      },
      data: { stage: 'ENGAGED' },
    });
    results.stagesAdvanced += toEngaged.count;

    return NextResponse.json({
      ok: true,
      results,
      processedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error('[marketing-automation] error:', err?.message || err);
    return NextResponse.json({ error: 'Erro na automação' }, { status: 500 });
  }
}
