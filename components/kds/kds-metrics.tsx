'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';

interface MetricsProps {
  orders: any[];
}

export function KDSMetrics({ orders }: MetricsProps) {
  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const preparing = orders.filter((o) => o.status === 'PREPARING').length;
  const ready = orders.filter((o) => o.status === 'READY').length;
  const completed = orders.filter((o) => o.status === 'COMPLETED').length;
  const urgent = orders.filter((o) => o.priority === 'URGENT').length;

  const avgPrepTime = orders
    .filter((o) => o.completedAt && o.actualStartTime)
    .reduce((acc, o) => {
      const start = new Date(o.actualStartTime).getTime();
      const end = new Date(o.completedAt).getTime();
      return acc + (end - start) / 1000 / 60;
    }, 0) / Math.max(orders.length, 1);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <Card className="p-4 text-center border-l-4 border-yellow-400">
        <div className="text-3xl font-bold text-yellow-600">{pending}</div>
        <p className="text-sm text-gray-600 flex items-center justify-center gap-1 mt-1">
          <AlertCircle className="w-4 h-4" /> À Fazer
        </p>
      </Card>

      <Card className="p-4 text-center border-l-4 border-blue-400">
        <div className="text-3xl font-bold text-blue-600">{preparing}</div>
        <p className="text-sm text-gray-600 flex items-center justify-center gap-1 mt-1">
          <Clock className="w-4 h-4" /> Em Preparo
        </p>
      </Card>

      <Card className="p-4 text-center border-l-4 border-green-400">
        <div className="text-3xl font-bold text-green-600">{ready}</div>
        <p className="text-sm text-gray-600 flex items-center justify-center gap-1 mt-1">
          <CheckCircle className="w-4 h-4" /> Pronto
        </p>
      </Card>

      <Card className="p-4 text-center border-l-4 border-gray-400">
        <div className="text-3xl font-bold text-gray-600">{completed}</div>
        <p className="text-sm text-gray-600 flex items-center justify-center gap-1 mt-1">
          ✓ Completado
        </p>
      </Card>

      <Card className="p-4 text-center border-l-4 border-red-400">
        <div className="text-3xl font-bold text-red-600">{urgent}</div>
        <p className="text-sm text-gray-600 flex items-center justify-center gap-1 mt-1">
          <Zap className="w-4 h-4" /> Urgente
        </p>
      </Card>
    </div>
  );
}
