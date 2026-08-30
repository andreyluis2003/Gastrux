// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/nurturing/execute
 * Executa o fluxo de nurturing para leads da calculadora.
 * Avança leads pela sequência de conteúdo educativo.
 * Pode ser chamado via session, CRON_SECRET ou Bearer token.
 */

const SEQUENCE_DAYS = [0, 3, 7, 14, 21];

export async function POST(req: NextRequest) {
  // Auth: session ou CRON_SECRET
  const internalTrigger = req.headers.get('x-internal-trigger');
  const cronSecret = process.env.CRON_SECRET;

  if (internalTrigger && cronSecret && internalTrigger === cronSecret) {
    // OK
  } else {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ') && cronSecret && authHeader.slice(7) === cronSecret) {
      // OK
    } else {
      const session = await getServerSession(authOptions);
      if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const results = {
      leadsProcessed: 0,
      stagesAdvanced: 0,
      leadsNurtured: 0,
    };

    // Buscar leads de calculadora em estágio de nurturing
    const leads = await prisma.marketingLead.findMany({
      where: {
        source: 'CALCULATOR',
        status: { notIn: ['CONVERTED', 'LOST', 'UNRESPONSIVE'] },
        email: { not: null },
      },
    });

    for (const lead of leads) {
      results.leadsProcessed++;
      const daysSinceCapture = Math.floor(
        (now.getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determinar qual conteúdo já deveria ter sido enviado
      const contactAttempts = lead.contactAttempts || 0;

      // Encontrar o próximo conteúdo na sequência
      const nextSequenceIndex = contactAttempts;
      if (nextSequenceIndex >= SEQUENCE_DAYS.length) continue; // Já completou toda a sequência

      const nextDay = SEQUENCE_DAYS[nextSequenceIndex];
      if (daysSinceCapture >= nextDay) {
        // Hora de avançar — incrementar contactAttempts e atualizar stage
        let newStage = lead.stage;
        let newStatus = lead.status;

        if (nextSequenceIndex === 0) {
          newStage = 'WELCOME_SENT';
          newStatus = 'NURTURING';
        } else if (nextSequenceIndex >= 2) {
          newStage = 'ENGAGED';
        }

        // Se último da sequência, marcar como CONVERSION_PENDING
        if (nextSequenceIndex === SEQUENCE_DAYS.length - 1) {
          newStage = 'CONVERSION_PENDING';
        }

        await prisma.marketingLead.update({
          where: { id: lead.id },
          data: {
            contactAttempts: contactAttempts + 1,
            lastContactAt: now,
            stage: newStage,
            status: newStatus,
            // Calcular próximo follow-up
            nextFollowUpAt:
              nextSequenceIndex + 1 < SEQUENCE_DAYS.length
                ? new Date(
                    new Date(lead.createdAt).getTime() +
                      SEQUENCE_DAYS[nextSequenceIndex + 1] * 24 * 60 * 60 * 1000
                  )
                : null,
          },
        });

        results.stagesAdvanced++;
        results.leadsNurtured++;
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      processedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error('[nurturing-execute] error:', err?.message || err);
    return NextResponse.json({ error: 'Erro no nurturing' }, { status: 500 });
  }
}
