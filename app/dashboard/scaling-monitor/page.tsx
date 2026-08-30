'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, Database, Zap, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ScalingMonitorPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/analytics/scaling-metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6 animate-pulse space-y-4">{[...Array(4)].map((_, i) => (<div key={i} className="h-32 bg-gray-200 rounded-lg" />))}</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold">Monitoramento de Escalabilidade</h1>
        <p className="text-sm text-gray-600 mt-2">Acompanhe performance e preparação para crescimento</p>
        {lastUpdate && (
          <p className="text-xs text-gray-500 mt-1">Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}</p>
        )}
      </div>

      {/* System Health Cards */}
      {metrics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Usuarios Ativos</p>
                  <p className="text-2xl font-bold mt-1">{metrics.activeUsers || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Ultimos 30 dias</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Emails Enviados</p>
                  <p className="text-2xl font-bold mt-1">{metrics.totalEmailsSent || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Este mes</p>
                </div>
                <Zap className="h-8 w-8 text-yellow-500 opacity-50" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Taxa Entrega</p>
                  <p className="text-2xl font-bold mt-1">{metrics.avgDeliveryRate || 0}%</p>
                  <p className="text-xs text-gray-500 mt-1">Emails entregues</p>
                </div>
                <Activity className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Registros BD</p>
                  <p className="text-2xl font-bold mt-1">{(metrics.dbRecordCount / 1000).toFixed(1)}k</p>
                  <p className="text-xs text-gray-500 mt-1">Total de registros</p>
                </div>
                <Database className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </Card>
          </div>

          {/* Scaling Recommendations */}
          <Card className="p-4 border-l-4 border-orange-500 bg-orange-50">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900 mb-1">Recomendações de Escalabilidade</h3>
                <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
                  {metrics.recommendations && metrics.recommendations.length > 0 ? (
                    metrics.recommendations.map((rec: string, i: number) => <li key={i}>{rec}</li>)
                  ) : (
                    <li>Sistema operando normalmente sem problemas de escalabilidade</li>
                  )}
                </ul>
              </div>
            </div>
          </Card>

          {/* Growth Chart */}
          {metrics.growthData && metrics.growthData.length > 0 && (
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Crescimento de Usuarios (Ultimos 30 dias)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.growthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="signups" stroke="#3b82f6" name="Novos Signups" />
                  <Line type="monotone" dataKey="cumulative" stroke="#8b5cf6" name="Total Acumulado" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Performance Tips */}
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
            <h3 className="text-lg font-semibold mb-3">Dicas de Otimização</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>✓ Batch processing: Enviar emails em lotes de 50-100 por ciclo</li>
              <li>✓ Rate limiting: Delay de 100-200ms entre emails para evitar throttling</li>
              <li>✓ Database indexes: Adicionar indices em campos frequentemente filtrados</li>
              <li>✓ Caching: Cachear dados de usuários para evitar N+1 queries</li>
              <li>✓ Async processing: Usar fila de tarefas para operações pesadas</li>
              <li>✓ Monitoring: Acompanhar metricas de CPU, memoria e conexoes DB</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
