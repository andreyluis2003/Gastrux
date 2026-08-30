'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/formatters';

interface PriceTrendChartProps {
  data: any;
  loading?: boolean;
}

export function PriceTrendChart({ data, loading }: PriceTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tendência de Preço</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center text-muted-foreground">
          Carregando gráfico...
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.trends || data.trends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tendência de Preço</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center text-muted-foreground">
          Nenhum dado disponível
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Tendência de Preço - {data.ingredient?.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data.trends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              label={{
                value: 'Preço (R$)',
                angle: -90,
                position: 'insideLeft',
              }}
            />
            <Tooltip
              formatter={(value) => formatBRL(value as number)}
              labelFormatter={(label) => `Data: ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="avgPrice"
              stroke="#3b82f6"
              name="Preço Médio"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="minPrice"
              stroke="#10b981"
              name="Preço Mínimo"
              strokeDasharray="5 5"
              strokeWidth={1}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="maxPrice"
              stroke="#ef4444"
              name="Preço Máximo"
              strokeDasharray="5 5"
              strokeWidth={1}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {data.statistics && (
          <div className="grid grid-cols-3 gap-4 mt-6 p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-xs text-muted-foreground">Preço Médio</div>
              <div className="text-lg font-semibold">
                {formatBRL(data.statistics.avgPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Preço Mínimo</div>
              <div className="text-lg font-semibold">
                {formatBRL(data.statistics.minPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Preço Máximo</div>
              <div className="text-lg font-semibold">
                {formatBRL(data.statistics.maxPrice)}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
