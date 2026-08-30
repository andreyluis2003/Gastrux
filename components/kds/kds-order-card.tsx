'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderItem {
  id: string;
  quantity: number;
  specialInstructions?: string;
  status: string;
  recipe: {
    name: string;
  };
  station?: {
    name: string;
  };
}

interface OrderCardProps {
  order: {
    id: string;
    orderNumber: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    status: string;
    createdAt: string;
    estimatedPrepTime?: number;
    actualStartTime?: string;
    items: OrderItem[];
    totalItems: number;
    specialInstructions?: string;
    externalOrder?: { id: string; customerName: string };
    reservation?: { id: string; guestName: string };
  };
  onStatusChange?: (orderId: string, newStatus: string) => void;
  onItemStatusChange?: (itemId: string, newStatus: string) => void;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'URGENT':
      return 'bg-red-500';
    case 'HIGH':
      return 'bg-orange-500';
    case 'NORMAL':
      return 'bg-blue-500';
    case 'LOW':
      return 'bg-gray-500';
    default:
      return 'bg-blue-500';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'PREPARING':
      return 'bg-blue-100 text-blue-800';
    case 'READY':
      return 'bg-green-100 text-green-800';
    case 'COMPLETED':
      return 'bg-gray-100 text-gray-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const ItemStatus = (status: string) => {
  switch (status) {
    case 'PENDING':
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case 'PREPARING':
      return <Clock className="w-4 h-4 text-blue-500" />;
    case 'READY':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'COMPLETED':
      return <CheckCircle className="w-4 h-4 text-gray-500" />;
    default:
      return null;
  }
};

export function KDSOrderCard({
  order,
  onStatusChange,
  onItemStatusChange,
}: OrderCardProps) {
  const [elapsed, setElapsed] = useState(0);
  const source = order.externalOrder
    ? `Delivery: ${order.externalOrder.customerName}`
    : order.reservation
      ? `Reserva: ${order.reservation.guestName}`
      : 'Pedido';

  useEffect(() => {
    const startTime = new Date(order.createdAt).getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      setElapsed(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [order.createdAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const completedItems = order.items.filter((i) => i.status === 'COMPLETED')
    .length;
  const progress = (completedItems / order.totalItems) * 100;

  return (
    <Card
      className={cn(
        'p-4 border-l-4 hover:shadow-lg transition-shadow',
        getPriorityColor(order.priority)
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg">{order.orderNumber}</h3>
            <Badge className={getStatusColor(order.status)}>
              {order.status}
            </Badge>
            {order.priority !== 'NORMAL' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {order.priority}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">{source}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-lg">{formatTime(elapsed)}</p>
          {order.estimatedPrepTime && (
            <p className="text-sm text-gray-600">
              Est: {order.estimatedPrepTime}min
            </p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-600">
            {completedItems}/{order.totalItems} itens
          </span>
          <span className="font-semibold">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between text-sm bg-gray-50 p-2 rounded"
          >
            <div className="flex items-start gap-2 flex-1">
              {ItemStatus(item.status)}
              <div className="flex-1">
                <p className="font-medium">
                  {item.quantity}x {item.recipe.name}
                </p>
                {item.station && (
                  <p className="text-xs text-gray-500">{item.station.name}</p>
                )}
                {item.specialInstructions && (
                  <p className="text-xs text-orange-600 italic">
                    {item.specialInstructions}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Special Instructions */}
      {order.specialInstructions && (
        <div className="mb-3 p-2 bg-yellow-50 border-l-2 border-yellow-400 rounded">
          <p className="text-sm text-yellow-800">
            📝 {order.specialInstructions}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {order.status === 'PENDING' && (
          <Button
            size="sm"
            onClick={() => onStatusChange?.(order.id, 'PREPARING')}
            className="flex-1 bg-blue-500 hover:bg-blue-600"
          >
            Iniciar
          </Button>
        )}
        {order.status === 'PREPARING' && (
          <Button
            size="sm"
            onClick={() => onStatusChange?.(order.id, 'READY')}
            className="flex-1 bg-green-500 hover:bg-green-600"
          >
            Pronto
          </Button>
        )}
        {order.status === 'READY' && (
          <Button
            size="sm"
            onClick={() => onStatusChange?.(order.id, 'COMPLETED')}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            Completar
          </Button>
        )}
      </div>
    </Card>
  );
}
