'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  date: string;
  revenue: number;
}

interface RevenueChartProps {
  data: DataPoint[];
  title?: string;
}

export function RevenueChart({ data, title = 'Tendencia de Revenue' }: RevenueChartProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `R$ ${(value / 100).toLocaleString('pt-BR')}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '8px',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#0066ff"
            strokeWidth={2}
            dot={{ fill: '#0066ff', r: 4 }}
            activeDot={{ r: 6 }}
            name="Daily Revenue"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
