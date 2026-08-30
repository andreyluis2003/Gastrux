'use client';

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

interface ConsumptionTrendData {
  date: string;
  quantity: number;
  forecast: number;
}

interface IngredientData {
  name: string;
  quantity: number;
  percentage: number;
}

interface RiskDistributionData {
  name: string;
  value: number;
  percentage: number;
}

const COLORS = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  trend: '#3b82f6',
  forecast: '#8b5cf6',
};

export function ConsumptionTrendChart({
  data,
}: {
  data: ConsumptionTrendData[];
}) {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="quantity"
            stroke={COLORS.trend}
            name="Consumido"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke={COLORS.forecast}
            name="Previsão"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopIngredientsChart({
  data,
}: {
  data: IngredientData[];
}) {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
          <Bar dataKey="quantity" fill={COLORS.trend} name="Quantidade" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskDistributionChart({
  data,
}: {
  data: RiskDistributionData[];
}) {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry: any) => `${entry.name} (${entry.percentage}%)`}
            outerRadius={120}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={getColorForRisk(entry.name)}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceHistoryChart({
  data,
}: {
  data: Array<{ date: string; price: number; supplier: string }>;
}) {
  // Group by supplier
  const suppliers = [...new Set(data.map((d) => d.supplier))];
  const chartColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            style={{ fontSize: '12px' }}
            label={{ value: 'Preço (R$)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value) =>
              typeof value === 'number' ? `R$ ${value.toFixed(2)}` : value
            }
          />
          <Legend />
          {suppliers.map((supplier, idx) => (
            <Line
              key={supplier}
              type="monotone"
              dataKey={`price_${supplier}`}
              stroke={chartColors[idx % chartColors.length]}
              name={supplier}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function getColorForRisk(riskLevel: string): string {
  switch (riskLevel) {
    case 'Crítico':
    case 'CRITICAL':
      return COLORS.critical;
    case 'Alto':
    case 'HIGH':
      return COLORS.high;
    case 'Médio':
    case 'MEDIUM':
      return COLORS.medium;
    case 'Baixo':
    case 'LOW':
      return COLORS.low;
    default:
      return COLORS.low;
  }
}
