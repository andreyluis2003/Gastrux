// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateProductionPlanReportHtml, type ProductionPlanReportData } from '@/lib/report-templates';
import { generatePdfFromHtml, PDF_STYLES } from '@/lib/pdf-generator';
import { checkTransactionLimit, incrementTransactionCount } from '@/lib/transaction-limiter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check transaction limit BEFORE processing
    const limitCheck = await checkTransactionLimit(session.user.id);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Limite de transações atingido',
          message: limitCheck.message,
          tier: limitCheck.tier,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          suggestUpgrade: limitCheck.tier === 'starter',
        },
        { status: 429 }
      );
    }

    // Fetch production plan data
    const plans = await prisma.productionPlan.findMany({
      include: {
        items: {
          include: {
            recipe: true,
          },
        },
      },
      orderBy: {
        planDate: 'desc',
      },
    });

    const data: ProductionPlanReportData = {
      plans,
      totalPlans: plans.length,
      generatedAt: new Date(),
    };

    const html = generateProductionPlanReportHtml(data);
    const pdfBuffer = await generatePdfFromHtml({
      html_content: html,
      css_stylesheet: PDF_STYLES,
      pdf_options: {
        format: 'A4',
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      },
    });

    // Increment transaction counter ONLY after success
    await incrementTransactionCount(session.user.id);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="relatorio-planejamento.pdf"',
      },
    });
  } catch (error) {
    console.error('Error generating production plan report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
