'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Users, ShoppingCart, AlertTriangle } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface KPICard {
  label: string;
  value: string | number;
  format?: 'currency' | 'number';
  change?: number;
  icon: React.ReactNode;
  color: string;
}

interface DashboardKPIsProps {
  kpis: {
    totalRevenue: number;
    todayRevenue: number;
    totalOrders: number;
    avgTicket: number;
    profitMargin: number;
    totalUsers: number;
    activeUsers: number;
    staffCount: number;
    lowStockCount: number;
  };
}

export function DashboardKPIs({ kpis }: DashboardKPIsProps) {
  const cards: KPICard[] = [
    {
      label: 'Receita Total',
      value: kpis.totalRevenue,
      format: 'currency',
      change: 12.5,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-blue-50 border-blue-200',
    },
    {
      label: 'Receita Hoje',
      value: kpis.todayRevenue,
      format: 'currency',
      icon: <ShoppingCart className="w-5 h-5" />,
      color: 'bg-green-50 border-green-200',
    },
    {
      label: 'Total de Pedidos',
      value: kpis.totalOrders,
      format: 'number',
      icon: <ShoppingCart className="w-5 h-5" />,
      color: 'bg-purple-50 border-purple-200',
    },
    {
      label: 'Ticket Médio',
      value: kpis.avgTicket,
      format: 'currency',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-amber-50 border-amber-200',
    },
    {
      label: 'Margem de Lucro',
      value: `${kpis.profitMargin.toFixed(1)}%`,
      format: 'number',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-cyan-50 border-cyan-200',
    },
    {
      label: 'Usuários Ativos',
      value: kpis.activeUsers,
      format: 'number',
      icon: <Users className="w-5 h-5" />,
      color: 'bg-indigo-50 border-indigo-200',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`p-6 rounded-lg border-2 ${card.color} bg-white shadow-sm hover:shadow-md transition-shadow`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 mb-1">{card.label}</p>
              <p className="text-2xl font-bold text-slate-900">
                {card.format === 'currency' ? formatBRL(Number(card.value)) : card.value}
              </p>
              {card.change !== undefined && card.change > 0 && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  +{card.change}% comparado ao período anterior
                </p>
              )}
            </div>
            <div className="text-slate-400">{card.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
