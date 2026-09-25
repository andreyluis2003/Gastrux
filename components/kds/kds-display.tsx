'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KDSOrderCard } from './kds-order-card';
import { KDSStationView } from './kds-station-view';
import { KDSMetrics } from './kds-metrics';
import { toast } from 'sonner';
import { printInHiddenFrame } from '@/lib/print/print-frame';

// Per device (the kitchen computer): print new orders by itself, and which orders were printed
const AUTOPRINT_KEY = 'gastrux:kds-autoprint';
const PRINTED_KEY = 'gastrux:kds-printed';
const readPrinted = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(PRINTED_KEY) || '[]');
  } catch {
    return [];
  }
};
const savePrinted = (ids: string[]) => {
  try {
    localStorage.setItem(PRINTED_KEY, JSON.stringify(ids.slice(-300)));
  } catch {}
};

interface KDSDisplayProps {
  stationId?: string;
}

export function KDSDisplay({ stationId }: KDSDisplayProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);

  useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(AUTOPRINT_KEY) === '1');
    } catch {}
  }, []);

  // Printing phase 1: every NEW order (not printed on this device yet) gets its kitchen ticket
  useEffect(() => {
    if (!autoPrint) return;
    const printed = readPrinted();
    const fresh = orders.filter((o) => o.status === 'PENDING' && !printed.includes(o.id));
    if (fresh.length === 0) return;
    savePrinted([...printed, ...fresh.map((o) => o.id)]);
    fresh.forEach((o, i) => setTimeout(() => printInHiddenFrame(`/imprimir/cozinha/${o.id}`), i * 1500));
  }, [orders, autoPrint]);

  const toggleAutoPrint = (on: boolean) => {
    // turning it on does not print the orders already on the screen, only the next ones
    if (on) savePrinted([...readPrinted(), ...orders.map((o) => o.id)]);
    try {
      localStorage.setItem(AUTOPRINT_KEY, on ? '1' : '0');
    } catch {}
    setAutoPrint(on);
  };
  const [viewMode, setViewMode] = useState<'all' | 'station'>(
    stationId ? 'station' : 'all'
  );

  // Load initial orders and stations
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch orders
        const ordersRes = await fetch(
          `/api/kds/orders?status=PENDING,PREPARING,READY`,
          // always the live list (a cached answer kept the kitchen up to 5 min behind)
          { cache: 'no-store' }
        );
        if (!ordersRes.ok) throw new Error('Failed to fetch orders');
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);
        setLastUpdate(new Date());

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
          `/api/kds/orders?status=PENDING,PREPARING,READY`,
          // always the live list (a cached answer kept the kitchen up to 5 min behind)
          { cache: 'no-store' }
        );
        if (!ordersRes.ok) throw new Error('Failed to fetch orders');
        
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);
        setConnected(true);
        setLastUpdate(new Date());
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

      const updatedOrder = await response.json().catch(() => ({}));
      if (!response.ok) {
        // 409: another screen already completed or cancelled it; show its real status
        if (response.status === 409 && updatedOrder.currentStatus) {
          setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: updatedOrder.currentStatus } : o)));
        }
        toast.error(updatedOrder.error || 'Erro ao atualizar pedido');
        return;
      }

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
        <label className="flex items-center gap-2 text-sm" title="Para imprimir sem a janela de confirmação, abra o Chrome da cozinha com --kiosk-printing">
          <input type="checkbox" checked={autoPrint} onChange={(e) => toggleAutoPrint(e.target.checked)} />
          Imprimir pedidos novos automaticamente
        </label>
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

      {/* The kitchen must know when the list stopped updating: new orders may be missing */}
      {!connected && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 text-red-800 px-4 py-3 font-semibold">
          Sem conexão: a lista pode estar desatualizada e pedidos novos podem não aparecer.
          {lastUpdate && ` Última atualização às ${lastUpdate.toLocaleTimeString('pt-BR')}.`} Avise o salão.
        </div>
      )}

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
