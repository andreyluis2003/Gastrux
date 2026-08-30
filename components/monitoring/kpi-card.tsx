'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  icon: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple';
  description?: string;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-900 border-blue-200',
  green: 'bg-green-50 text-green-900 border-green-200',
  red: 'bg-red-50 text-red-900 border-red-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  purple: 'bg-purple-50 text-purple-900 border-purple-200',
};

const iconColorClasses = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  red: 'bg-red-100 text-red-600',
  amber: 'bg-amber-100 text-amber-600',
  purple: 'bg-purple-100 text-purple-600',
};

export function KPICard({
  title,
  value,
  unit = '',
  trend,
  icon,
  color = 'blue',
  description,
}: KPICardProps) {
  const isTrendPositive = trend !== undefined && trend >= 0;
  const trendAbs = trend !== undefined ? Math.abs(trend) : 0;

  return (
    <div className={`rounded-lg border p-6 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-75">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold">
              {typeof value === 'number'
                ? value.toLocaleString('pt-BR')
                : value}
            </p>
            {unit && <span className="text-lg opacity-75">{unit}</span>}
          </div>
          {description && (
            <p className="mt-2 text-xs opacity-60">{description}</p>
          )}
        </div>
        <div className={`rounded-lg p-3 ${iconColorClasses[color]}`}>
          {icon}
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-4 flex items-center gap-1">
          {isTrendPositive ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
          <span
            className={`text-sm font-medium ${
              isTrendPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isTrendPositive ? '+' : '-'}{trendAbs.toFixed(2)}%
          </span>
          <span className="text-xs opacity-60">vs. mês anterior</span>
        </div>
      )}
    </div>
  );
}
