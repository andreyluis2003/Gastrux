'use client';

import { Card } from './card';
import React from 'react';

interface QuickStatProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
}

export function QuickStats({ label, value, icon, color = 'text-blue-600', trend }: QuickStatProps) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium mb-1">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          {trend && (
            <p className={`text-xs mt-2 font-semibold ${
              trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
            }`}>
              {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && <div className={`${color} text-3xl opacity-10`}>{icon}</div>}
      </div>
    </Card>
  );
}
