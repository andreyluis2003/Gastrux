// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateStockReportHtml, type StockReportData } from '@/lib/report-templates';
import { generatePdfFromHtml, PDF_STYLES } from '@/lib/pdf-generator';
import { checkTransactionLimit, incrementTransactionCount } from '@/lib/transaction-limiter';
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

    // Fetch stock data
    const stocks = await prisma.stock.findMany({
      where: { restaurantId },
      include: {
        ingredient: {
          include: {
            category: true,
          },
        },
      },
    });

    // Calculate metrics
    let totalValue = 0;
    let criticalItems = 0;
    let lowItems = 0;

    stocks.forEach((stock) => {
      const value = stock.currentQuantity * stock.ingredient.referenceCost;
      totalValue += value;

      if (stock.currentQuantity < stock.ingredient.minimumStock) {
        if (stock.currentQuantity < stock.ingredient.minimumStock * 0.5) {
          criticalItems++;
        } else {
          lowItems++;
        }
      }
    });

    const data: StockReportData = {
      stocks,
      totalValue,
      criticalItems,
      lowItems,
      generatedAt: new Date(),
    };

    const html = generateStockReportHtml(data);
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
        'Content-Disposition': 'attachment; filename="relatorio-estoque.pdf"',
      },
    });
  } catch (error) {
    console.error('Error generating stock report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
