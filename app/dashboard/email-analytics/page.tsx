'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Mail, TrendingUp, Eye, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316'];

export default function EmailAnalyticsPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [dailyTrend, setDailyTrend] = useState<any[]>([]);
  const [byVariant, setByVariant] = useState<any[]>([]);
  const [emailType, setEmailType] = useState('day7');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [emailType, days]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/analytics/email-delivery?emailType=${emailType}&days=${days}`
      );
      const data = await res.json();

      if (res.ok) {
        setMetrics(data.metrics);
        setDailyTrend(data.dailyTrend);
        setByVariant(data.byVariant);
      }
    } catch (error) {
      toast.error('Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold">Email Delivery Analytics</h1>
        <p className="text-sm text-gray-600 mt-2">Acompanhe entrega, abertura e cliques em emails</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={emailType}
          onChange={(e) => setEmailType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="day3">Email Dia 3</option>
          <option value="day7">Email Dia 7</option>
          <option value="welcome">Welcome Email</option>
        </select>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value={7}>Ultimos 7 dias</option>
          <option value={30}>Ultimos 30 dias</option>
          <option value={90}>Ultimos 90 dias</option>
        </select>
        <Button onClick={fetchAnalytics} variant="default">
          Atualizar
        </Button>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Enviados</p>
                <p className="text-2xl font-bold mt-1">{metrics.total}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Taxa de Entrega</p>
                <p className="text-2xl font-bold mt-1">{metrics.deliveryRate}%</p>
                <p className="text-xs text-gray-500 mt-1">{metrics.delivered}/{metrics.total}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Taxa de Abertura</p>
                <p className="text-2xl font-bold mt-1">{metrics.openRate}%</p>
              </div>
              <Eye className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Taxa de Clique</p>
                <p className="text-2xl font-bold mt-1">{metrics.clickRate}%</p>
              </div>
              <MousePointerClick className="h-8 w-8 text-pink-500 opacity-50" />
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {dailyTrend.length > 0 && (
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4\">Tendencia Diaria</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sent" stroke="#3b82f6" name="Enviados" />
                <Line type="monotone" dataKey="opened" stroke="#8b5cf6" name="Abertos" />
                <Line type="monotone" dataKey="clicked" stroke="#ec4899" name="Cliques" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {byVariant.length > 0 && (
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Resultados A/B Testing</h3>
            <div className="space-y-4">
              {byVariant.map((v: any, i: number) => (
                <div key={i} className="border-b pb-3 last:border-b-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Variante {v.variant?.toUpperCase() || 'N/A'}</span>
                    <span className="text-sm text-gray-600">{v.sent} enviados</span>
                  </div>
                  <div className="mt-2 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-full"
                      style={{ width: `${v.openRate}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Taxa de abertura: {v.openRate}%</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
