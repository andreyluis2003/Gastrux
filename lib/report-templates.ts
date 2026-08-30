// @ts-nocheck
import { formatBRL, formatDate, formatQuantity } from './formatters';

export interface StockReportData {
  stocks: Array<{
    id: string;
    ingredient: {
      id: string;
      code: string;
      name: string;
      category: { name: string; color: string };
      standardUnit: string;
      minimumStock: number;
      referenceCost: number;
    };
    currentQuantity: number;
  }>;
  totalValue: number;
  criticalItems: number;
  lowItems: number;
  generatedAt: Date;
}

export interface SupplierReportData {
  suppliers: Array<{
    id: string;
    code: string;
    name: string;
    cnpj: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    contactPerson: string | null;
    integrations: Array<{
      id: string;
      integrationType: string;
      isActive: boolean;
      lastSyncStatus: string;
      lastSyncedAt: Date | null;
    }>;
    ingredients: Array<{
      id: string;
      name: string;
    }>;
  }>;
  totalSuppliers: number;
  activeSuppliers: number;
  generatedAt: Date;
}

export interface ForecastReportData {
  forecasts: Array<{
    id: string;
    ingredient: {
      id: string;
      code: string;
      name: string;
      standardUnit: string;
    };
    currentStock: number;
    dailyConsumptionAvg: number;
    daysUntilEmpty: number;
    riskLevel: string;
    suggestedReorderQty: number;
    confidenceLevel: number;
  }>;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  generatedAt: Date;
}

export interface ProductionPlanReportData {
  plans: Array<{
    id: string;
    planDate: Date;
    notes: string | null;
    items: Array<{
      id: string;
      quantity: number;
      recipe: {
        id: string;
        code: string;
        name: string;
        baseYield: number;
        yieldUnit: string;
      };
    }>;
  }>;
  totalPlans: number;
  generatedAt: Date;
}

export function generateStockReportHtml(data: StockReportData): string {
  const items = data.stocks
    .map((stock) => {
      const value = stock.currentQuantity * stock.ingredient.referenceCost;
      const status =
        stock.currentQuantity < stock.ingredient.minimumStock
          ? '<span class="badge badge-error">Crítico</span>'
          : '<span class="badge badge-success">OK</span>';
      return `
        <tr>
          <td>${stock.ingredient.code}</td>
          <td>${stock.ingredient.name}</td>
          <td>${stock.ingredient.category.name}</td>
          <td>${formatQuantity(stock.currentQuantity, stock.ingredient.standardUnit)}</td>
          <td>${formatQuantity(stock.ingredient.minimumStock, stock.ingredient.standardUnit)}</td>
          <td>${formatBRL(value)}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório de Status de Estoque</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: white; }
        .page { padding: 40px; page-break-after: always; }
        .page:last-child { page-break-after: avoid; }
        h1 { font-size: 32px; margin-bottom: 10px; color: #1a1a1a; }
        h2 { font-size: 24px; margin: 30px 0 15px 0; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 8px; }
        .header { text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .header-title { font-size: 28px; font-weight: bold; color: #1a1a1a; margin-bottom: 5px; }
        .header-subtitle { font-size: 14px; color: #666; }
        .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .stat-card { flex: 1; min-width: 150px; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        table th { background-color: #007bff; color: white; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; }
        table td { padding: 10px 12px; border-bottom: 1px solid #ddd; font-size: 13px; }
        table tr:nth-child(even) { background-color: #f8f9fa; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .badge-success { background-color: #d1fae5; color: #065f46; }
        .badge-error { background-color: #fee2e2; color: #991b1b; }
        .footer { text-align: right; font-size: 11px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="header-title">📦 Relatório de Status de Estoque</div>
          <div class="header-subtitle">Gerado em ${formatDate(new Date())}</div>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Valor Total em Estoque</div>
            <div class="stat-value">${formatBRL(data.totalValue)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Itens Críticos</div>
            <div class="stat-value" style="color: #dc2626">${data.criticalItems}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Itens Baixos</div>
            <div class="stat-value" style="color: #d97706">${data.lowItems}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total de Itens</div>
            <div class="stat-value">${data.stocks.length}</div>
          </div>
        </div>

        <h2>Detalhamento do Estoque</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Quantidade</th>
              <th>Mínimo</th>
              <th>Valor Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${items}
          </tbody>
        </table>

        <div class="footer">
          <p>Este relatório foi gerado automaticamente pela plataforma de gestão de restaurante.</p>
          <p>${formatDate(new Date())}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateSupplierReportHtml(data: SupplierReportData): string {
  const supplierRows = data.suppliers
    .map((supplier) => {
      const statusBadge = supplier.status === 'ACTIVE'
        ? '<span class="badge badge-success">Ativo</span>'
        : '<span class="badge badge-error">Inativo</span>';
      const integrationCount = supplier.integrations.filter((i) => i.isActive).length;
      return `
        <tr>
          <td>${supplier.code}</td>
          <td>${supplier.name}</td>
          <td>${supplier.cnpj || '-'}</td>
          <td>${supplier.contactPerson || '-'}</td>
          <td>${supplier.email || '-'}</td>
          <td>${integrationCount}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório de Fornecedores</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: white; }
        .page { padding: 40px; page-break-after: always; }
        h2 { font-size: 24px; margin: 30px 0 15px 0; color: #333; border-bottom: 2px solid #7c3aed; padding-bottom: 8px; }
        .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 20px; margin-bottom: 30px; }
        .header-title { font-size: 28px; font-weight: bold; color: #1a1a1a; margin-bottom: 5px; }
        .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .stat-card { flex: 1; min-width: 150px; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #7c3aed; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        table th { background-color: #7c3aed; color: white; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; }
        table td { padding: 10px 12px; border-bottom: 1px solid #ddd; font-size: 12px; }
        table tr:nth-child(even) { background-color: #f8f9fa; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .badge-success { background-color: #d1fae5; color: #065f46; }
        .badge-error { background-color: #fee2e2; color: #991b1b; }
        .footer { text-align: right; font-size: 11px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="header-title">🚚 Relatório de Fornecedores</div>
          <div class="header-subtitle">Gerado em ${formatDate(new Date())}</div>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Total de Fornecedores</div>
            <div class="stat-value">${data.totalSuppliers}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Fornecedores Ativos</div>
            <div class="stat-value" style="color: #10b981">${data.activeSuppliers}</div>
          </div>
        </div>

        <h2>Lista de Fornecedores</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>Contato</th>
              <th>Email</th>
              <th>Integrações</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${supplierRows}
          </tbody>
        </table>

        <div class="footer">
          <p>Este relatório foi gerado automaticamente pela plataforma de gestão de restaurante.</p>
          <p>${formatDate(new Date())}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateForecastReportHtml(data: ForecastReportData): string {
  const forecastRows = data.forecasts
    .map((forecast) => {
      const riskColor = forecast.riskLevel === 'CRITICAL' ? '#dc2626'
        : forecast.riskLevel === 'HIGH' ? '#d97706'
          : forecast.riskLevel === 'MEDIUM' ? '#f59e0b'
            : '#10b981';
      const riskLabel = forecast.riskLevel === 'CRITICAL' ? 'Crítico'
        : forecast.riskLevel === 'HIGH' ? 'Alto'
          : forecast.riskLevel === 'MEDIUM' ? 'Médio'
            : 'Baixo';
      return `
        <tr>
          <td>${forecast.ingredient.code}</td>
          <td>${forecast.ingredient.name}</td>
          <td>${formatQuantity(forecast.currentStock, forecast.ingredient.standardUnit)}</td>
          <td>${formatQuantity(forecast.dailyConsumptionAvg, forecast.ingredient.standardUnit)}</td>
          <td><strong>${forecast.daysUntilEmpty.toFixed(1)}</strong></td>
          <td>${formatQuantity(forecast.suggestedReorderQty, forecast.ingredient.standardUnit)}</td>
          <td><strong style="color: ${riskColor}">${riskLabel}</strong></td>
          <td>${(forecast.confidenceLevel * 100).toFixed(0)}%</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório de Previsões</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: white; }
        .page { padding: 40px; page-break-after: always; }
        h2 { font-size: 24px; margin: 30px 0 15px 0; color: #333; border-bottom: 2px solid #10b981; padding-bottom: 8px; }
        .header { text-align: center; border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
        .header-title { font-size: 28px; font-weight: bold; color: #1a1a1a; margin-bottom: 5px; }
        .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .stat-card { flex: 1; min-width: 150px; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 11px; }
        table th { background-color: #10b981; color: white; padding: 10px; text-align: left; font-weight: 600; font-size: 11px; }
        table td { padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 11px; }
        table tr:nth-child(even) { background-color: #f8f9fa; }
        .footer { text-align: right; font-size: 11px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="header-title">📈 Relatório de Previsões</div>
          <div class="header-subtitle">Gerado em ${formatDate(new Date())}</div>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Itens Críticos</div>
            <div class="stat-value" style="color: #dc2626">${data.criticalCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Itens Alto Risco</div>
            <div class="stat-value" style="color: #d97706">${data.highCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Itens Médio Risco</div>
            <div class="stat-value" style="color: #f59e0b">${data.mediumCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Itens Baixo Risco</div>
            <div class="stat-value" style="color: #10b981">${data.lowCount}</div>
          </div>
        </div>

        <h2>Análise de Previsões de Estoque</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Estoque Atual</th>
              <th>Consumo Diário</th>
              <th>Dias até Vazio</th>
              <th>Qty. Recomendada</th>
              <th>Risco</th>
              <th>Confiança</th>
            </tr>
          </thead>
          <tbody>
            ${forecastRows}
          </tbody>
        </table>

        <div class="footer">
          <p>Este relatório foi gerado automaticamente pela plataforma de gestão de restaurante.</p>
          <p>${formatDate(new Date())}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateProductionPlanReportHtml(data: ProductionPlanReportData): string {
  const planRows = data.plans
    .map((plan) => {
      const recipes = plan.items.map((item) => `${item.recipe.name} (${item.quantity}x)`).join(', ');
      return `
        <tr>
          <td>${formatDate(plan.planDate)}</td>
          <td>${plan.items.length}</td>
          <td>${recipes}</td>
          <td>${plan.notes || '-'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório de Planejamento de Produção</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: white; }
        .page { padding: 40px; page-break-after: always; }
        h2 { font-size: 24px; margin: 30px 0 15px 0; color: #333; border-bottom: 2px solid #f97316; padding-bottom: 8px; }
        .header { text-align: center; border-bottom: 3px solid #f97316; padding-bottom: 20px; margin-bottom: 30px; }
        .header-title { font-size: 28px; font-weight: bold; color: #1a1a1a; margin-bottom: 5px; }
        .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .stat-card { flex: 1; min-width: 150px; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #f97316; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        table th { background-color: #f97316; color: white; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; }
        table td { padding: 10px 12px; border-bottom: 1px solid #ddd; font-size: 12px; }
        table tr:nth-child(even) { background-color: #f8f9fa; }
        .footer { text-align: right; font-size: 11px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="header-title">📋 Relatório de Planejamento de Produção</div>
          <div class="header-subtitle">Gerado em ${formatDate(new Date())}</div>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Total de Planos</div>
            <div class="stat-value">${data.totalPlans}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total de Receitas</div>
            <div class="stat-value">${data.plans.reduce((acc, p) => acc + p.items.length, 0)}</div>
          </div>
        </div>

        <h2>Planos de Produção</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Quantidade de Receitas</th>
              <th>Receitas</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${planRows}
          </tbody>
        </table>

        <div class="footer">
          <p>Este relatório foi gerado automaticamente pela plataforma de gestão de restaurante.</p>
          <p>${formatDate(new Date())}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
