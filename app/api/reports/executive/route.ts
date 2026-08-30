// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

async function htmlToPdf(htmlContent: string): Promise<Buffer> {
  // Step 1: Create the PDF generation request
  const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deployment_token: process.env.ABACUSAI_API_KEY,
      html_content: htmlContent,
      pdf_options: { format: 'A4', print_background: true },
      base_url: process.env.NEXTAUTH_URL || '',
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({ error: 'Failed to create PDF request' }));
    throw new Error(error.error || 'Failed to create PDF request');
  }

  const { request_id } = await createResponse.json();
  if (!request_id) {
    throw new Error('No request ID returned from PDF API');
  }

  // Step 2: Poll for status until completion
  const maxAttempts = 120;
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1500));

    const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
    });

    const statusResult = await statusResponse.json();
    const status = statusResult?.status || 'FAILED';
    const result = statusResult?.result || null;

    if (status === 'SUCCESS') {
      if (result && result.result) {
        return Buffer.from(result.result, 'base64');
      }
      throw new Error('PDF generation completed but no result data');
    } else if (status === 'FAILED') {
      throw new Error(result?.error || 'PDF generation failed');
    }
    attempts++;
  }

  throw new Error('PDF generation timed out');
}

// POST: Generate executive report PDF
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await req.json();
    const { reportType, days = 30, includeRecipes = true } = body;

    let htmlContent = '';

    switch (reportType) {
      case 'cmv':
        htmlContent = await generateCMVReport(days, restaurantId);
        break;
      case 'menu-engineering':
        htmlContent = await generateMenuEngineeringReport(restaurantId);
        break;
      case 'waste':
        htmlContent = await generateWasteReport(days, restaurantId);
        break;
      case 'comprehensive':
        htmlContent = await generateComprehensiveReport(days, includeRecipes, restaurantId);
        break;
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }

    const pdfBuffer = await htmlToPdf(htmlContent);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Executive report error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate report' },
      { status: 500 }
    );
  }
}

async function generateCMVReport(days: number, restaurantId: string): Promise<string> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const movements = await prisma.stockMovement.findMany({
    where: { restaurantId, createdAt: { gte: startDate } },
    include: { ingredient: true },
  });

  let totalCMV = 0;
  const ingredientCosts: Record<string, { cost: number; qty: number }> = {};

  movements.forEach((m) => {
    if (!ingredientCosts[m.ingredient.name]) {
      ingredientCosts[m.ingredient.name] = { cost: 0, qty: 0 };
    }
    const cost = Math.abs(m.quantity) * (m.ingredient.referenceCost || 0);
    ingredientCosts[m.ingredient.name].cost += cost;
    ingredientCosts[m.ingredient.name].qty += Math.abs(m.quantity);
    totalCMV += cost;
  });

  const topIngredients = Object.entries(ingredientCosts)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório CMV</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; }
          h1 { color: #1f2937; margin-bottom: 10px; }
          .subtitle { color: #6b7280; margin-bottom: 30px; font-size: 14px; }
          .kpi-container { display: flex; gap: 20px; margin-bottom: 40px; }
          .kpi-card { flex: 1; background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; }
          .kpi-value { font-size: 24px; font-weight: bold; color: #059669; }
          .kpi-label { font-size: 13px; color: #6b7280; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          th { background: #f9fafb; font-weight: bold; }
          .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
          .empty-msg { text-align: center; color: #9ca3af; padding: 40px; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>📊 Relatório de CMV</h1>
        <p class="subtitle">Período: Últimos ${days} dias | Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        
        <div class="kpi-container">
          <div class="kpi-card">
            <div class="kpi-value">R$ ${totalCMV.toFixed(2)}</div>
            <div class="kpi-label">CMV Total</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">R$ ${days > 0 ? (totalCMV / days).toFixed(2) : '0.00'}</div>
            <div class="kpi-label">Média Diária</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${movements.length}</div>
            <div class="kpi-label">Movimentações</div>
          </div>
        </div>
        
        <h2>Top 10 Ingredientes por Custo</h2>
        ${topIngredients.length === 0 ? '<p class="empty-msg">Nenhuma movimentação encontrada no período.</p>' : `
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Ingrediente</th>
              <th>Custo Total (R$)</th>
              <th>Quantidade</th>
              <th>% do Total</th>
            </tr>
          </thead>
          <tbody>
            ${topIngredients.map((ing, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${ing.name}</td>
                <td>R$ ${ing.cost.toFixed(2)}</td>
                <td>${ing.qty.toFixed(2)}</td>
                <td>${totalCMV > 0 ? ((ing.cost / totalCMV) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
        
        <div class="footer">
          <p>Relatório gerado automaticamente pelo sistema Gastrux.</p>
        </div>
      </body>
    </html>
  `;
}

async function generateMenuEngineeringReport(restaurantId: string): Promise<string> {
  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, active: true },
    include: { productionPlans: { take: 30 } },
  });

  const classifications: Record<string, Array<{ name: string; popularity: number; margin: string; cost: string; sellingPrice: string }>> = {
    STAR: [],
    WORKHORSE: [],
    PUZZLE: [],
    DOG: [],
  };

  recipes.forEach((recipe) => {
    const popularity = recipe.productionPlans?.length || 0;
    const costPerPortion = recipe.costPerPortion || 0;
    const sellingPrice = recipe.sellingPrice || 0;
    const profitMargin = sellingPrice > 0
      ? ((sellingPrice - costPerPortion) / sellingPrice) * 100
      : 0;

    let classification = 'DOG';
    if (popularity > 5 && profitMargin > 30) classification = 'STAR';
    else if (popularity > 5) classification = 'WORKHORSE';
    else if (profitMargin > 30) classification = 'PUZZLE';

    classifications[classification].push({
      name: recipe.name,
      popularity,
      margin: profitMargin.toFixed(1),
      cost: costPerPortion.toFixed(2),
      sellingPrice: sellingPrice > 0 ? sellingPrice.toFixed(2) : 'N/A',
    });
  });

  const classLabels: Record<string, { emoji: string; label: string; color: string }> = {
    STAR: { emoji: '⭐', label: 'Stars (Alta Popularidade + Alta Margem)', color: '#f59e0b' },
    WORKHORSE: { emoji: '🐎', label: 'Workhorses (Alta Popularidade + Baixa Margem)', color: '#3b82f6' },
    PUZZLE: { emoji: '🧩', label: 'Puzzles (Baixa Popularidade + Alta Margem)', color: '#8b5cf6' },
    DOG: { emoji: '🐕', label: 'Dogs (Baixa Popularidade + Baixa Margem)', color: '#ef4444' },
  };

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Engenharia de Cardápio</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; }
          h1 { color: #1f2937; margin-bottom: 10px; }
          .subtitle { color: #6b7280; margin-bottom: 30px; font-size: 14px; }
          .summary { display: flex; gap: 15px; margin-bottom: 30px; }
          .summary-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; background: #f3f4f6; }
          .summary-count { font-size: 28px; font-weight: bold; }
          .summary-label { font-size: 12px; color: #6b7280; }
          .classification { margin: 25px 0; }
          .classification h3 { margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          th { background: #f9fafb; font-weight: bold; }
          .empty-msg { color: #9ca3af; font-style: italic; padding: 10px 0; }
          .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
        </style>
      </head>
      <body>
        <h1>📋 Engenharia de Cardápio</h1>
        <p class="subtitle">Análise Matriz BCG | Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total: ${recipes.length} receitas</p>
        
        <div class="summary">
          ${Object.entries(classLabels).map(([key, info]) => `
            <div class="summary-card">
              <div class="summary-count" style="color: ${info.color}">${classifications[key].length}</div>
              <div class="summary-label">${info.emoji} ${key}</div>
            </div>
          `).join('')}
        </div>
        
        ${Object.entries(classLabels).map(([key, info]) => `
          <div class="classification">
            <h3 style="color: ${info.color}">${info.emoji} ${info.label}</h3>
            ${classifications[key].length === 0 ? '<p class="empty-msg">Nenhuma receita nesta categoria.</p>' : `
            <table>
              <thead>
                <tr>
                  <th>Receita</th>
                  <th>Popularidade</th>
                  <th>Margem %</th>
                  <th>Custo</th>
                  <th>Preço de Venda</th>
                </tr>
              </thead>
              <tbody>
                ${classifications[key].map((r) => `
                  <tr>
                    <td>${r.name}</td>
                    <td>${r.popularity}</td>
                    <td>${r.margin}%</td>
                    <td>R$ ${r.cost}</td>
                    <td>${r.sellingPrice === 'N/A' ? 'N/A' : 'R$ ' + r.sellingPrice}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            `}
          </div>
        `).join('')}
        
        <div class="footer">
          <p><strong>Recomendação:</strong> Foque nos Stars, otimize os Workhorses, promova os Puzzles e reavalie os Dogs.</p>
        </div>
      </body>
    </html>
  `;
}

async function generateWasteReport(days: number, restaurantId: string): Promise<string> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const wasteLogs = await prisma.wasteLog.findMany({
    where: { restaurantId, date: { gte: startDate } },
    include: { ingredient: true },
  });

  const totalWasteCost = wasteLogs.reduce((sum, w) => sum + (w.estimatedCost || 0), 0);
  const wasteByReason: Record<string, number> = {};
  const topWasted: Record<string, number> = {};

  wasteLogs.forEach((w) => {
    const reason = w.reason || 'Não especificado';
    wasteByReason[reason] = (wasteByReason[reason] || 0) + (w.estimatedCost || 0);
    const ingName = w.ingredient?.name || 'Desconhecido';
    topWasted[ingName] = (topWasted[ingName] || 0) + (w.estimatedCost || 0);
  });

  const topWastedList = Object.entries(topWasted)
    .map(([name, cost]) => ({ name, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Desperdício</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; }
          h1 { color: #1f2937; margin-bottom: 10px; }
          .subtitle { color: #6b7280; margin-bottom: 30px; font-size: 14px; }
          .kpi-container { display: flex; gap: 20px; margin-bottom: 40px; }
          .kpi-card { flex: 1; background: #fef2f2; padding: 20px; border-radius: 8px; text-align: center; }
          .kpi-value { font-size: 24px; font-weight: bold; color: #dc2626; }
          .kpi-label { font-size: 13px; color: #6b7280; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          th { background: #f9fafb; font-weight: bold; }
          .empty-msg { text-align: center; color: #9ca3af; padding: 40px; font-style: italic; }
          .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
        </style>
      </head>
      <body>
        <h1>🗑️ Relatório de Desperdício</h1>
        <p class="subtitle">Período: Últimos ${days} dias | Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        
        <div class="kpi-container">
          <div class="kpi-card">
            <div class="kpi-value">R$ ${totalWasteCost.toFixed(2)}</div>
            <div class="kpi-label">Custo Total de Desperdício</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${wasteLogs.length}</div>
            <div class="kpi-label">Eventos de Desperdício</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">R$ ${days > 0 ? (totalWasteCost / days).toFixed(2) : '0.00'}</div>
            <div class="kpi-label">Média Diária</div>
          </div>
        </div>
        
        <h2>Desperdício por Motivo</h2>
        ${Object.keys(wasteByReason).length === 0 ? '<p class="empty-msg">Nenhum registro de desperdício no período.</p>' : `
        <table>
          <thead>
            <tr><th>Motivo</th><th>Custo (R$)</th><th>% do Total</th></tr>
          </thead>
          <tbody>
            ${Object.entries(wasteByReason)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, cost]) => `
              <tr>
                <td>${reason}</td>
                <td>R$ ${cost.toFixed(2)}</td>
                <td>${totalWasteCost > 0 ? ((cost / totalWasteCost) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
        
        <h2>Top 10 Ingredientes Mais Desperdiçados</h2>
        ${topWastedList.length === 0 ? '<p class="empty-msg">Nenhum registro encontrado.</p>' : `
        <table>
          <thead>
            <tr><th>#</th><th>Ingrediente</th><th>Custo Total (R$)</th></tr>
          </thead>
          <tbody>
            ${topWastedList.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.name}</td>
                <td>R$ ${item.cost.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
        
        <div class="footer">
          <p>Relatório gerado automaticamente pelo sistema Gastrux.</p>
        </div>
      </body>
    </html>
  `;
}

async function generateComprehensiveReport(days: number, includeRecipes: boolean, restaurantId: string): Promise<string> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch all data in parallel
  const [movements, wasteLogs, recipes] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { restaurantId, createdAt: { gte: startDate } },
      include: { ingredient: true },
    }),
    prisma.wasteLog.findMany({
      where: { restaurantId, date: { gte: startDate } },
      include: { ingredient: true },
    }),
    prisma.recipe.findMany({
      where: { restaurantId, active: true },
      include: { productionPlans: { take: 30 }, ...(includeRecipes ? { ingredients: { include: { ingredient: true } } } : {}) },
    }),
  ]);

  // CMV summary
  let totalCMV = 0;
  movements.forEach((m) => {
    totalCMV += Math.abs(m.quantity) * (m.ingredient.referenceCost || 0);
  });

  // Waste summary
  const totalWaste = wasteLogs.reduce((sum, w) => sum + (w.estimatedCost || 0), 0);

  // Recipe classification
  let stars = 0, workhorses = 0, puzzles = 0, dogs = 0;
  recipes.forEach((recipe) => {
    const popularity = recipe.productionPlans?.length || 0;
    const sp = recipe.sellingPrice || 0;
    const cp = recipe.costPerPortion || 0;
    const margin = sp > 0 ? ((sp - cp) / sp) * 100 : 0;
    if (popularity > 5 && margin > 30) stars++;
    else if (popularity > 5) workhorses++;
    else if (margin > 30) puzzles++;
    else dogs++;
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório Executivo Completo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; }
          h1 { text-align: center; margin-bottom: 5px; }
          .subtitle { text-align: center; color: #6b7280; margin-bottom: 40px; font-size: 14px; }
          .executive-summary { background: #f0fdf4; padding: 25px; border-radius: 12px; margin-bottom: 35px; }
          .executive-summary h2 { margin-top: 0; color: #166534; }
          .summary-grid { display: flex; gap: 15px; margin-top: 15px; }
          .summary-item { flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center; }
          .summary-value { font-size: 22px; font-weight: bold; }
          .summary-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .section { margin: 35px 0; page-break-inside: avoid; }
          .section h2 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
          th { background: #f9fafb; font-weight: bold; }
          .matrix-grid { display: flex; gap: 10px; margin-top: 15px; }
          .matrix-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; }
          .matrix-count { font-size: 28px; font-weight: bold; }
          .matrix-label { font-size: 11px; }
          .empty-msg { color: #9ca3af; font-style: italic; padding: 15px 0; }
          .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; text-align: center; }
        </style>
      </head>
      <body>
        <h1>📊 Relatório Executivo Completo</h1>
        <p class="subtitle">Análise dos últimos ${days} dias | Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        
        <div class="executive-summary">
          <h2>Resumo Executivo</h2>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-value" style="color: #059669">R$ ${totalCMV.toFixed(2)}</div>
              <div class="summary-label">CMV Total</div>
            </div>
            <div class="summary-item">
              <div class="summary-value" style="color: #dc2626">R$ ${totalWaste.toFixed(2)}</div>
              <div class="summary-label">Desperdício Total</div>
            </div>
            <div class="summary-item">
              <div class="summary-value" style="color: #2563eb">${recipes.length}</div>
              <div class="summary-label">Receitas Ativas</div>
            </div>
            <div class="summary-item">
              <div class="summary-value" style="color: #7c3aed">${movements.length}</div>
              <div class="summary-label">Movimentações</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>1. Análise CMV</h2>
          <p>CMV médio diário: <strong>R$ ${days > 0 ? (totalCMV / days).toFixed(2) : '0.00'}</strong></p>
          <p>Total de movimentações no período: <strong>${movements.length}</strong></p>
        </div>

        <div class="section">
          <h2>2. Desperdício</h2>
          <p>Custo total de desperdício: <strong>R$ ${totalWaste.toFixed(2)}</strong></p>
          <p>Eventos registrados: <strong>${wasteLogs.length}</strong></p>
          <p>Média diária: <strong>R$ ${days > 0 ? (totalWaste / days).toFixed(2) : '0.00'}</strong></p>
          ${totalCMV > 0 ? `<p>Desperdício como % do CMV: <strong>${((totalWaste / totalCMV) * 100).toFixed(1)}%</strong></p>` : ''}
        </div>

        <div class="section">
          <h2>3. Engenharia de Cardápio</h2>
          <div class="matrix-grid">
            <div class="matrix-card" style="background: #fef3c7">
              <div class="matrix-count" style="color: #b45309">${stars}</div>
              <div class="matrix-label">⭐ Stars</div>
            </div>
            <div class="matrix-card" style="background: #dbeafe">
              <div class="matrix-count" style="color: #1d4ed8">${workhorses}</div>
              <div class="matrix-label">🐎 Workhorses</div>
            </div>
            <div class="matrix-card" style="background: #ede9fe">
              <div class="matrix-count" style="color: #6d28d9">${puzzles}</div>
              <div class="matrix-label">🧩 Puzzles</div>
            </div>
            <div class="matrix-card" style="background: #fee2e2">
              <div class="matrix-count" style="color: #b91c1c">${dogs}</div>
              <div class="matrix-label">🐕 Dogs</div>
            </div>
          </div>
        </div>

        ${includeRecipes && recipes.length > 0 ? `
        <div class="section">
          <h2>4. Detalhes das Receitas</h2>
          <table>
            <thead>
              <tr>
                <th>Receita</th>
                <th>Custo/Porção</th>
                <th>Preço de Venda</th>
                <th>Margem</th>
              </tr>
            </thead>
            <tbody>
              ${recipes.map(r => {
                const sp = r.sellingPrice || 0;
                const cp = r.costPerPortion || 0;
                const margin = sp > 0 ? ((sp - cp) / sp) * 100 : 0;
                return `
                <tr>
                  <td>${r.name}</td>
                  <td>R$ ${cp.toFixed(2)}</td>
                  <td>${sp > 0 ? 'R$ ' + sp.toFixed(2) : 'N/A'}</td>
                  <td>${sp > 0 ? margin.toFixed(1) + '%' : 'N/A'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="footer">
          <p>Relatório Executivo gerado automaticamente pelo sistema Gastrux.</p>
        </div>
      </body>
    </html>
  `;
}