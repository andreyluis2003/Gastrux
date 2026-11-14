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
import { ingredientRanking, ingredientShares } from '@/lib/consumption/shares';
import { bucketTrends, type TrendGrain } from '@/lib/consumption/trends';

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
  /** Days in the period: long periods are grouped by week or month */
  periodDays?: number;
  /** The unit every ingredient shares; null = mixed units, so no quantity chart */
  unit?: string | null;
}

const GRAIN_LABEL: Record<TrendGrain, string> = { day: 'por dia', week: 'por semana', month: 'por mês' };

export function ConsumptionChart({
  trends = [],
  topIngredients = [],
  periodDays = 30,
  unit = null,
}: ConsumptionChartProps) {
  const shares = ingredientShares(topIngredients);
  const ranking = ingredientRanking(topIngredients);
  const { grain, points } = bucketTrends(trends, periodDays);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {points.length > 0 && unit && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartLine className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tendência de Consumo
            </h3>
          </div>
          <p className="-mt-2 mb-2 text-xs text-slate-500">Quantidade em {unit}, {GRAIN_LABEL[grain]}</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748b" />
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
                name={`Quantidade (${unit})`}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {points.length > 0 && (
        <Card className={`p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${unit ? '' : 'lg:col-span-2'}`}>
          <div className="flex items-center gap-2 mb-4">
            <ChartLine className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Custo de Consumo
            </h3>
          </div>
          <p className="-mt-2 mb-2 text-xs text-slate-500">
            Em reais, {GRAIN_LABEL[grain]}{unit ? '' : ' (os ingredientes têm unidades diferentes, então a soma é pelo custo)'}
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748b" />
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

      {ranking.items.length > 0 && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartBar className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {ranking.basis === 'cost' ? 'Ingredientes que mais custaram' : 'Ingredientes mais usados'}
            </h3>
          </div>
          {ranking.basis === 'quantity' && (
            <p className="-mt-2 mb-2 text-xs text-slate-500">Sem custo cadastrado: pela quantidade, cada um na sua unidade</p>
          )}
          {/* Horizontal bars: the names read whole on the left; quantities in different units are not compared by cost (2026-11-11) */}
          <ResponsiveContainer width="100%" height={Math.max(160, ranking.items.length * 36 + 20)}>
            <BarChart data={ranking.items} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#64748b"
                tickFormatter={(v: number) => (ranking.basis === 'cost' ? `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : v.toLocaleString('pt-BR'))} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} stroke="#64748b"
                tickFormatter={(n: string) => (n.length > 16 ? `${n.slice(0, 15)}…` : n)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: any, _n: any, item: any) => [
                  ranking.basis === 'cost'
                    ? `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item?.payload?.unit ?? ''}`.trim(),
                  ranking.basis === 'cost' ? 'Custo' : 'Quantidade',
                ]}
              />
              <Bar dataKey="value" fill="#f59e0b" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {shares.items.length > 0 && (
        <Card className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <ChartPie className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Distribuição por Ingrediente
            </h3>
          </div>
          <p className="-mt-2 mb-2 text-xs text-slate-500">
            {shares.basis === 'cost' ? 'Pelo custo de cada ingrediente' : 'Pela quantidade (sem custo cadastrado)'}
          </p>
          {/* Names go in the list below: labels around the pie were cut off and overlapped (2026-11-11) */}
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={shares.items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={1}>
                {shares.items.map((s, index) => (
                  <Cell key={s.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: any, name: any) => [
                  shares.basis === 'cost'
                    ? `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-3 space-y-1.5">
            {shares.items.map((s, index) => (
              <li key={s.name} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300" title={s.name}>{s.name}</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-white">{s.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
