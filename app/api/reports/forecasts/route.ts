// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateForecastReportHtml, type ForecastReportData } from '@/lib/report-templates';
import { generatePdfFromHtml, PDF_STYLES } from '@/lib/pdf-generator';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

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

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    // Fetch forecast data
    const forecasts = await prisma.stockForecast.findMany({
      where: { restaurantId },
      include: {
        ingredient: true,
      },
    });

    const criticalCount = forecasts.filter((f) => f.riskLevel === 'CRITICAL').length;
    const highCount = forecasts.filter((f) => f.riskLevel === 'HIGH').length;
    const mediumCount = forecasts.filter((f) => f.riskLevel === 'MEDIUM').length;
    const lowCount = forecasts.filter((f) => f.riskLevel === 'LOW').length;

    const data: ForecastReportData = {
      forecasts: forecasts.map((f) => ({
        id: f.id,
        ingredient: {
          id: f.ingredient.id,
          code: f.ingredient.code,
          name: f.ingredient.name,
          standardUnit: f.ingredient.standardUnit,
        },
        currentStock: Number(f.currentStock),
        dailyConsumptionAvg: Number(f.dailyConsumptionAvg),
        daysUntilEmpty: f.daysUntilEmpty,
        riskLevel: f.riskLevel,
        suggestedReorderQty: Number(f.suggestedReorderQty),
        confidenceLevel: Number(f.confidenceLevel),
      })),
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      generatedAt: new Date(),
    };

    const html = generateForecastReportHtml(data);
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

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="relatorio-previsoes.pdf"',
      },
    });
  } catch (error) {
    console.error('Error generating forecast report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
