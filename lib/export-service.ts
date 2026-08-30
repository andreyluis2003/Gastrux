// @ts-nocheck
export interface ExportData {
  headers: string[];
  rows: (string | number)[][];
  filename: string;
}

export function exportToCSV(data: ExportData) {
  const { headers, rows, filename } = data;

  // Build CSV content
  const csvContent = [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((row) => row.map((cell) => {
      if (typeof cell === 'string' && cell.includes(',')) {
        return `"${cell}"`;
      }
      return cell;
    }).join(',')),
  ].join('\n');

  // Create blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  // Trigger download
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(data: any[], filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateStockExport(stocks: any[]): ExportData {
  return {
    headers: ['Código', 'Insumo', 'Categoria', 'Quantidade', 'Unidade', 'Custo Unitário', 'Valor Total', 'Mínimo'],
    rows: stocks.map((stock) => [
      stock.ingredient.code,
      stock.ingredient.name,
      stock.ingredient.category.name,
      stock.currentQuantity.toFixed(2),
      stock.ingredient.standardUnit,
      stock.ingredient.referenceCost.toFixed(2),
      (stock.currentQuantity * stock.ingredient.referenceCost).toFixed(2),
      stock.ingredient.minimumStock.toFixed(2),
    ]),
    filename: `estoque-${new Date().toISOString().split('T')[0]}.csv`,
  };
}

export function generateForecastExport(forecasts: any[]): ExportData {
  return {
    headers: ['Código', 'Insumo', 'Estoque Atual', 'Consumo Diário', 'Dias até Vazio', 'Risco', 'Qty Recomendada', 'Confiança'],
    rows: forecasts.map((f) => [
      f.ingredient.code,
      f.ingredient.name,
      f.currentStock.toFixed(2),
      f.dailyConsumptionAvg.toFixed(2),
      f.daysUntilEmpty.toFixed(1),
      f.riskLevel,
      f.suggestedReorderQty.toFixed(2),
      `${(f.confidenceLevel * 100).toFixed(0)}%`,
    ]),
    filename: `previsoes-${new Date().toISOString().split('T')[0]}.csv`,
  };
}

export function generateRecipeExport(recipes: any[]): ExportData {
  return {
    headers: ['Código', 'Receita', 'Rendimento', 'Unidade', 'Tempo Prep (min)', 'Porção (un)'],
    rows: recipes.map((r) => [
      r.code,
      r.name,
      r.baseYield.toFixed(2),
      r.yieldUnit,
      r.prepTimeMinutes || 0,
      r.portionSize || '-',
    ]),
    filename: `receitas-${new Date().toISOString().split('T')[0]}.csv`,
  };
}
