// @ts-nocheck
export function convertToCSV(data: Record<string, any>[]): string {
  if (data.length === 0) {
    return '';
  }

  // Obter headers
  const headers = Object.keys(data[0]);

  // Criar primeira linha com headers
  const csvHeaders = headers.map((header) => `"${header}"`).join(',');

  // Criar linhas de dados
  const csvRows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header] ?? '';
        // Escapar aspas duplas e colocar entre aspas se houver vírgula ou quebra de linha
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
      })
      .join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}
