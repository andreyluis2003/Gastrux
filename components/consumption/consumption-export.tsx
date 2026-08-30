'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

interface ConsumptionExportProps {
  period: string;
  ingredientIds: string[];
  types: string[];
}

export function ConsumptionExport({
  period,
  ingredientIds,
  types,
}: ConsumptionExportProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    try {
      setIsLoading(true);

      const params = new URLSearchParams();
      params.append('period', period);
      if (ingredientIds.length > 0) {
        params.append('ingredients', ingredientIds.join(','));
      }
      if (types.length > 0) {
        params.append('types', types.join(','));
      }

      const response = await fetch(
        `/api/consumption/export-csv?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `consumo-analise-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('[EXPORT ERROR]', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isLoading}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
    >
      <Download className="w-4 h-4" />
      {isLoading ? 'Exportando...' : 'Exportar CSV'}
    </Button>
  );
}
