'use client';

import { Card } from '@/components/ui/card';
import { formatBRL, formatQuantity } from '@/lib/formatters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingDown } from 'lucide-react';

interface IngredientStat {
  ingredientId: string;
  ingredientName: string;
  categoryName: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  frequency: number;
  averageDaily: number;
}

interface ConsumptionStatsProps {
  stats: IngredientStat[];
  summary?: {
    totalQuantity: number;
    totalCost: number;
    averageDailyQuantity: number;
    uniqueIngredients: number;
    totalMovements: number;
  };
}

export function ConsumptionStats({ stats, summary }: ConsumptionStatsProps) {
  if (stats.length === 0) {
    return (
      <Card className="p-8 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <TrendingDown className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-600 dark:text-slate-400">
          Nenhum dado de consumo encontrado no período
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-0">
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
              Total Consumido
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {summary.totalQuantity.toFixed(2)}
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              unidades
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-0">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
              Custo Total
            </div>
            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
              {formatBRL(summary.totalCost)}
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              no período
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-0">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
              Média Diária
            </div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {summary.averageDailyQuantity.toFixed(2)}
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              por dia
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-0">
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
              Ingredientes
            </div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {summary.uniqueIngredients}
            </div>
            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1">
              únicos
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900 border-0">
            <div className="text-xs font-medium text-pink-600 dark:text-pink-400 mb-1">
              Movimentações
            </div>
            <div className="text-2xl font-bold text-pink-900 dark:text-pink-100">
              {summary.totalMovements}
            </div>
            <div className="text-xs text-pink-700 dark:text-pink-300 mt-1">
              registradas
            </div>
          </Card>
        </div>
      )}

      <Card className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Análise por Ingrediente
          </h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <TableHead className="text-slate-900 dark:text-white font-semibold">
                  Ingrediente
                </TableHead>
                <TableHead className="text-right text-slate-900 dark:text-white font-semibold">
                  Categoria
                </TableHead>
                <TableHead className="text-right text-slate-900 dark:text-white font-semibold">
                  Total
                </TableHead>
                <TableHead className="text-right text-slate-900 dark:text-white font-semibold">
                  Custo
                </TableHead>
                <TableHead className="text-right text-slate-900 dark:text-white font-semibold">
                  Frequência
                </TableHead>
                <TableHead className="text-right text-slate-900 dark:text-white font-semibold">
                  Média/dia
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((stat) => (
                <TableRow
                  key={stat.ingredientId}
                  className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                >
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    <div>{stat.ingredientName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {stat.unit}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-slate-700 dark:text-slate-300">
                    {stat.categoryName}
                  </TableCell>
                  <TableCell className="text-right text-slate-700 dark:text-slate-300 font-medium">
                    {stat.totalQuantity.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700 dark:text-slate-300 font-medium">
                    {formatBRL(stat.totalCost)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700 dark:text-slate-300">
                    {stat.frequency}x
                  </TableCell>
                  <TableCell className="text-right text-slate-700 dark:text-slate-300">
                    {stat.averageDaily.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
