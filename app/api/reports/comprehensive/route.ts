// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePdfFromHtml, PDF_STYLES } from '@/lib/pdf-generator';
import { formatBRL, formatDate, formatQuantity } from '@/lib/formatters';

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

    // Fetch all data in parallel
    const [stocks, suppliers, forecasts, plans, recipes, ingredients] = await Promise.all([
      prisma.stock.findMany({
        include: {
          ingredient: {
            include: { category: true },
          },
        },
      }),
      prisma.supplier.findMany({
        include: { integrations: true },
      }),
      prisma.stockForecast.findMany(),
      prisma.productionPlan.findMany(),
      prisma.recipe.findMany(),
      prisma.ingredient.findMany(),
    ]);

    // Calculate metrics
    let totalStockValue = 0;
    stocks.forEach((stock) => {
      totalStockValue += stock.currentQuantity * stock.ingredient.referenceCost;
    });

    const criticalForecasts = forecasts.filter((f) => f.riskLevel === 'CRITICAL').length;
    const highForecasts = forecasts.filter((f) => f.riskLevel === 'HIGH').length;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Relatório Executivo Completo</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: white;
          }
          .page {
            padding: 40px;
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: avoid;
          }
          h1 {
            font-size: 32px;
            margin-bottom: 10px;
            color: #1a1a1a;
          }
          h2 {
            font-size: 24px;
            margin: 30px 0 15px 0;
            color: #333;
            border-bottom: 2px solid #4f46e5;
            padding-bottom: 8px;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #4f46e5;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header-title {
            font-size: 28px;
            font-weight: bold;
            color: #1a1a1a;
            margin-bottom: 5px;
          }
          .header-subtitle {
            font-size: 14px;
            color: #666;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin: 25px 0;
          }
          .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #4f46e5;
          }
          .stat-label {
            font-size: 11px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .stat-value {
            font-size: 20px;
            font-weight: bold;
            color: #1a1a1a;
          }
          .section-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
          }
          .alert {
            padding: 12px 15px;
            margin: 15px 0;
            border-radius: 6px;
            border-left: 4px solid;
            background-color: #fff5f5;
            border-left-color: #dc2626;
          }
          .footer {
            text-align: right;
            font-size: 11px;
            color: #999;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="header-title">📊 Relatório Executivo Completo</div>
            <div class="header-subtitle">Resumo consolidado de KPIs e métricas</div>
            <div class="header-subtitle" style="margin-top: 5px;">Gerado em ${formatDate(new Date())}</div>
          </div>

          <h2>Visão Geral - KPIs Principais</h2>
          <div class="stats">
            <div class="stat-card">
              <div class="stat-label">Valor Total em Estoque</div>
              <div class="stat-value">${formatBRL(totalStockValue)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total de Insumos</div>
              <div class="stat-value">${ingredients.length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total de Receitas</div>
              <div class="stat-value">${recipes.length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Fornecedores Ativos</div>
              <div class="stat-value">${suppliers.filter((s) => s.status === 'ACTIVE').length}</div>
            </div>
          </div>

          <h2>Alertas de Estoque</h2>
          ${criticalForecasts > 0 ? `
            <div class="alert">
              ⚠️ <strong>${criticalForecasts} item(ns) em risco CRÍTICO</strong> - Ação imediata necessária
            </div>
          ` : '<p style="color: #10b981;">✓ Nenhum item em risco crítico</p>'}
          ${highForecasts > 0 ? `
            <p style="margin-top: 10px;"><strong>${highForecasts} item(ns) em risco alto</strong> - Reordenar em breve</p>
          ` : ''}

          <h2>Estatísticas de Operação</h2>
          <div class="section-row">
            <div>
              <h3 style="font-size: 16px; margin-bottom: 10px;">Estoque</h3>
              <ul style="margin-left: 20px; line-height: 2;">
                <li>Total de itens: ${stocks.length}</li>
                <li>Valor total: ${formatBRL(totalStockValue)}</li>
                <li>Custo médio por item: ${formatBRL(stocks.length > 0 ? totalStockValue / stocks.length : 0)}</li>
              </ul>
            </div>
            <div>
              <h3 style="font-size: 16px; margin-bottom: 10px;">Fornecedores</h3>
              <ul style="margin-left: 20px; line-height: 2;">
                <li>Total: ${suppliers.length}</li>
                <li>Ativos: ${suppliers.filter((s) => s.status === 'ACTIVE').length}</li>
                <li>Com integração: ${suppliers.filter((s) => s.integrations.length > 0).length}</li>
              </ul>
            </div>
          </div>

          <div class="section-row">
            <div>
              <h3 style="font-size: 16px; margin-bottom: 10px;">Produção</h3>
              <ul style="margin-left: 20px; line-height: 2;">
                <li>Total de planos: ${plans.length}</li>
                <li>Receitas cadastradas: ${recipes.length}</li>
              </ul>
            </div>
            <div>
              <h3 style="font-size: 16px; margin-bottom: 10px;">Previsões</h3>
              <ul style="margin-left: 20px; line-height: 2;">
                <li>Risco crítico: ${criticalForecasts}</li>
                <li>Risco alto: ${highForecasts}</li>
                <li>Total analisado: ${forecasts.length}</li>
              </ul>
            </div>
          </div>

          <div class="footer">
            <p>Este relatório foi gerado automaticamente pela plataforma de gestão de restaurante.</p>
            <p>${formatDate(new Date())}</p>
          </div>
        </div>
      </body>
      </html>
    `;

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
        'Content-Disposition': 'attachment; filename="relatorio-executivo.pdf"',
      },
    });
  } catch (error) {
    console.error('Error generating comprehensive report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
