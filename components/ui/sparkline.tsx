'use client';

import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: Array<{ value: number; [key: string]: any }>;
  color?: string;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = '#10b981',
  height = 24,
  className,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
