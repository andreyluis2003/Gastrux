'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StationViewProps {
  stationId?: string;
  stationName?: string;
  displayColor?: string;
  orders: any[];
  onOrderStatusChange?: (orderId: string, newStatus: string) => void;
}

export function KDSStationView({
  stationId,
  stationName = 'Cozinha',
  displayColor = '#3b82f6',
  orders,
  onOrderStatusChange,
}: StationViewProps) {
  const pendingOrders = orders.filter((o) => o.status === 'PENDING');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY');

  return (
    <div className="space-y-4">
      <div
        className="px-4 py-3 rounded-lg text-white font-bold"
        style={{ backgroundColor: displayColor }}
      >
        {stationName}
      </div>

      {/* Pending Section */}
      {pendingOrders.length > 0 && (
        <div>
          <h4 className="font-semibold text-yellow-700 mb-2">A Fazer</h4>
          <div className="space-y-2">
            {pendingOrders.map((order) => (
              <Card key={order.id} className="p-3 border-yellow-200">
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-gray-600">Itens: {order.totalItems}</p>
                <Button
                  size="sm"
                  onClick={() => onOrderStatusChange?.(order.id, 'PREPARING')}
                  className="w-full mt-2 bg-yellow-500 hover:bg-yellow-600"
                >
                  Iniciar
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* In Progress Section */}
      {preparingOrders.length > 0 && (
        <div>
          <h4 className="font-semibold text-blue-700 mb-2">Em Preparo</h4>
          <div className="space-y-2">
            {preparingOrders.map((order) => (
              <Card key={order.id} className="p-3 border-blue-200">
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-gray-600">Itens: {order.totalItems}</p>
                <Button
                  size="sm"
                  onClick={() => onOrderStatusChange?.(order.id, 'READY')}
                  className="w-full mt-2 bg-blue-500 hover:bg-blue-600"
                >
                  Pronto
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Ready Section */}
      {readyOrders.length > 0 && (
        <div>
          <h4 className="font-semibold text-green-700 mb-2">Pronto</h4>
          <div className="space-y-2">
            {readyOrders.map((order) => (
              <Card
                key={order.id}
                className="p-3 border-green-200 bg-green-50"
              >
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-gray-600">Itens: {order.totalItems}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {pendingOrders.length === 0 &&
        preparingOrders.length === 0 &&
        readyOrders.length === 0 && (
          <Card className="p-8 text-center text-gray-500">
            <p>Nenhum pedido no momento</p>
          </Card>
        )}
    </div>
  );
}
