'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, Target, TrendingUp, Clock } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function ConversionAnalyticsPage() {
  const [funnel, setFunnel] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [bySource, setBySource] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversionData();
  }, [days]);

  const fetchConversionData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics/conversion-funnel?days=${days}`);
      const data = await res.json();

      if (res.ok) {
        setFunnel(data.funnel || []);
        setMetrics({
          totalSignups: data.totalSignups,
          totalConverted: data.totalConverted,
          conversionRate: data.conversionRate,
          emailDay7ConversionRate: data.emailDay7ConversionRate,
          avgDaysToConversion: data.avgDaysToConversion,
        });
        setBySource(data.conversionBySource || {});
      }
    } catch (error) {
      toast.error('Erro ao carregar analytics de conversao');
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
        <h1 className="text-xl sm:text-3xl font-bold">Análise de Conversão</h1>
        <p className="text-sm text-gray-600 mt-2">Acompanhe o funil de conversão de usuários</p>
      </div>

      <div className="flex gap-3">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value={7}>Ultimos 7 dias</option>
          <option value={30}>Ultimos 30 dias</option>
          <option value={90}>Ultimos 90 dias</option>
        </select>
        <Button onClick={fetchConversionData}>Atualizar</Button>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total de Signups</p>
                <p className="text-2xl font-bold mt-1">{metrics.totalSignups}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Conversões</p>
                <p className="text-2xl font-bold mt-1">{metrics.totalConverted}</p>
              </div>
              <Target className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Taxa de Conversão</p>
                <p className="text-2xl font-bold mt-1">{metrics.conversionRate}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Dias até Conversão</p>
                <p className="text-2xl font-bold mt-1">{metrics.avgDaysToConversion}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Funil de Conversão</h3>
          <div className="space-y-3">
            {funnel.map((stage: any, i: number) => {
              const width = Number(stage.percentage) || 0;
              return (
                <div key={i}>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{stage.stage}</span>
                    <span className="text-gray-600">{stage.count} ({stage.percentage}%)</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-3 overflow-hidden mt-1">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-full"
                      style={{ width: `${Math.min(width, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {bySource && Object.keys(bySource).length > 0 && (
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Conversões por Fonte</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={Object.entries(bySource).map(([source, count]: [string, any]) => ({
                    name: source,
                    value: count,
                  }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {Object.keys(bySource).map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {metrics && (
        <Card className="p-4 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Conversão Email Dia 7</h3>
              <p className="text-sm text-gray-600 mt-1">Taxa de conversão dos usuários que abriram o email de Dia 7</p>
            </div>
            <div className="text-3xl font-bold text-purple-600">{metrics.emailDay7ConversionRate}%</div>
          </div>
        </Card>
      )}
    </div>
  );
}
