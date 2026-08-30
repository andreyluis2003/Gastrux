'use client';

import { Card } from '@/components/ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartLine, ChartBar, ChartPie } from 'lucide-react';

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#6366f1',
  '#84cc16',
  '#f97316',
];

interface ConsumptionChartProps {
  trends?: {
    date: string;
    totalQuantity: number;
    totalCost: number;
    movements: number;
  }[];
  topIngredients?: {
    ingredientName: string;
    totalQuantity: number;
    totalCost: number;
    unit: string;
  }[];
}

export function ConsumptionChart({
  trends = [],
  topIngredients = [],
}: ConsumptionChartProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {trends.length > 0 && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartLine className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tendência de Consumo
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748b" />
              <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : String(value)}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalQuantity"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="Quantidade (un)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {trends.length > 0 && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartLine className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Custo de Consumo
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748b" />
              <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: any) =>
                  typeof value === 'number'
                    ? `R$ ${value.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : String(value)
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalCost"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="Custo (R$)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {topIngredients.length > 0 && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartBar className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Top Ingredientes (Volume)
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topIngredients}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="ingredientName"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={80}
                stroke="#64748b"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : String(value)}
              />
              <Bar
                dataKey="totalQuantity"
                fill="#f59e0b"
                name="Quantidade"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {topIngredients.length > 0 && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartPie className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Distribuição por Ingrediente
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={topIngredients}
                dataKey="totalQuantity"
                nameKey="ingredientName"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry: any) => {
                  const percent = (entry.percent ?? 0);
                  const name = entry.payload?.ingredientName || 'Unknown';
                  return `${name}: ${(percent * 100).toFixed(0)}%`;
                }}
              >
                {topIngredients.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
