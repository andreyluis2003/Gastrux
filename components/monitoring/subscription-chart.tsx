'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  date: string;
  activeCount: number;
}

interface SubscriptionChartProps {
  data: DataPoint[];
  title?: string;
}

export function SubscriptionChart({ data, title = 'Tendencia de Subscriptions' }: SubscriptionChartProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '8px',
            }}
            formatter={(value) => [`${value} subscriptions`, 'Active']}
          />
          <Area
            type="monotone"
            dataKey="activeCount"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorActive)"
            name="Active Subscriptions"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
