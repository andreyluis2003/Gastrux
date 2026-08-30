'use client';

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  revenue: number;
  cost?: number;
  orders?: number;
  margin?: number;
}

interface RevenueChartProps {
  data: ChartDataPoint[];
  title?: string;
  type?: 'line' | 'bar';
  loading?: boolean;
}

export function RevenueChart({
  data,
  title = 'Receita Últimos 7 Dias',
  type = 'line',
  loading,
}: RevenueChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border-2 border-slate-200 p-6 h-80 animate-pulse bg-slate-100" />
    );
  }

  return (
    <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        {type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
              formatter={(value: any) => `R$ ${typeof value === 'number' ? value.toFixed(2) : value}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
              name="Receita"
            />
            {data[0]?.cost !== undefined && (
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 4 }}
                name="Custo"
              />
            )}
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
              formatter={(value: any) => `R$ ${typeof value === 'number' ? value.toFixed(2) : value}`}
            />
            <Legend />
            <Bar dataKey="revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Receita" />
            {data[0]?.cost !== undefined && (
              <Bar dataKey="cost" fill="#ef4444" radius={[8, 8, 0, 0]} name="Custo" />
            )}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}