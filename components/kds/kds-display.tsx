'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KDSOrderCard } from './kds-order-card';
import { KDSStationView } from './kds-station-view';
import { KDSMetrics } from './kds-metrics';
import { toast } from 'sonner';

interface KDSDisplayProps {
  stationId?: string;
}

export function KDSDisplay({ stationId }: KDSDisplayProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'station'>(
    stationId ? 'station' : 'all'
  );

  // Load initial orders and stations
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch orders
        const ordersRes = await fetch(
          `/api/kds/orders?status=PENDING,PREPARING,READY`
        );
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);

        // Fetch stations
        const stationsRes = await fetch(`/api/kds/stations`);
        const stationsData = await stationsRes.json();
        setStations(stationsData || []);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('Falha ao carregar dados');
        setConnected(false);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Polling for order updates (fallback to polling until WebSocket is implemented)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const ordersRes = await fetch(
          `/api/kds/orders?status=PENDING,PREPARING,READY`
        );
        if (!ordersRes.ok) throw new Error('Failed to fetch orders');
        
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);
        setConnected(true);
      } catch (error) {
        console.error('Polling error:', error);
        setConnected(false);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/kds/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update order status');
      }

      const updatedOrder = await response.json();
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
      );
      toast.success(`Pedido atualizado para ${newStatus}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Erro ao atualizar pedido');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  const displayOrders = stationId
    ? orders.filter(
        (o) =>
          o.items?.some((i: any) => i.stationId === stationId) ||
          o.stationAssignments?.some((a: any) => a.stationId === stationId)
      )
    : orders;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Kitchen Display System</h1>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-600">
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <KDSMetrics orders={displayOrders} />

      {/* Main View */}
      <Tabs defaultValue={viewMode} onValueChange={(v) => setViewMode(v as any)}>
        <TabsList>
          {!stationId && <TabsTrigger value="all">Todos Pedidos</TabsTrigger>}
          <TabsTrigger value="station">Por Estação</TabsTrigger>
        </TabsList>

        {!stationId && (
          <TabsContent value="all" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayOrders.map((order) => (
                <KDSOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
            {displayOrders.length === 0 && (
              <Card className="p-8 text-center text-gray-500">
                Nenhum pedido no momento
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="station" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {stations.map((station) => {
              const stationOrders = orders.filter(
                (o) =>
                  o.items?.some((i: any) => i.stationId === station.id) ||
                  o.stationAssignments?.some(
                    (a: any) => a.stationId === station.id
                  )
              );
              return (
                <KDSStationView
                  key={station.id}
                  stationId={station.id}
                  stationName={station.name}
                  displayColor={station.displayColor}
                  orders={stationOrders}
                  onOrderStatusChange={handleStatusChange}
                />
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
