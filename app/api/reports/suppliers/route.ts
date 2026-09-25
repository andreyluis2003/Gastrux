// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateSupplierReportHtml, type SupplierReportData } from '@/lib/report-templates';
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


    // Fetch supplier data
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId },
      include: {
        integrations: true,
      },
    });

    const data: SupplierReportData = {
      suppliers: suppliers.map((supplier) => ({
        ...supplier,
        status: supplier.status as string,
        integrations: supplier.integrations.map((i) => ({
          ...i,
          integrationType: i.integrationType as string,
          lastSyncStatus: i.lastSyncStatus as string,
        })),
        ingredients: [],
      })),
      totalSuppliers: suppliers.length,
      activeSuppliers: suppliers.filter((s) => s.status === 'ACTIVE').length,
      generatedAt: new Date(),
    };

    const html = generateSupplierReportHtml(data);
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
        'Content-Disposition': 'attachment; filename="relatorio-fornecedores.pdf"',
      },
    });
  } catch (error) {
    console.error('Error generating supplier report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
