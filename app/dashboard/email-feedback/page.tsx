'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MessageSquare, Star, ThumbsUp, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#10b981', '#f59e0b', '#6b7280'];

export default function EmailFeedbackPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [ratings, setRatings] = useState<any>(null);
  const [sentiments, setSentiments] = useState<any>(null);
  const [byEmailType, setByEmailType] = useState<any>(null);
  const [emailType, setEmailType] = useState('day7');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback();
  }, [emailType]);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics/email-feedback?emailType=${emailType}`);
      const data = await res.json();

      if (res.ok) {
        setMetrics(data.metrics);
        setRatings(data.ratings);
        setSentiments(data.sentiments);
        setByEmailType(data.byEmailType);
      }
    } catch (error) {
      toast.error('Erro ao carregar feedback');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6 animate-pulse space-y-4">{[...Array(4)].map((_, i) => (<div key={i} className="h-32 bg-gray-200 rounded-lg" />))}</div>;
  }

  const sentimentData = sentiments ? Object.entries(sentiments).map(([key, value]: [string, any]) => ({
    name: key === 'positive' ? 'Positivo' : key === 'negative' ? 'Negativo' : 'Neutro',
    value,
  })) : [];

  const ratingData = ratings
    ? Object.entries(ratings)
        .map(([stars, count]: [string, any]) => ({
          stars: `${stars} stars`,
          count,
        }))
        .sort((a, b) => parseInt(a.stars) - parseInt(b.stars))
    : [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold">Feedback dos Emails</h1>
        <p className="text-sm text-gray-600 mt-2">Avalie a qualidade e utilidade dos emails enviados</p>
      </div>

      {/* Filter */}
      <select
        value={emailType}
        onChange={(e) => setEmailType(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
      >
        <option value="day3">Email Dia 3</option>
        <option value="day7">Email Dia 7</option>
        <option value="welcome">Welcome Email</option>
      </select>

      {/* KPI Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total de Feedback</p>
                <p className="text-2xl font-bold mt-1">{metrics.totalFeedback}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avaliação Média</p>
                <p className="text-2xl font-bold mt-1">{metrics.avgRating}</p>
                <p className="text-xs text-yellow-600 mt-1">de 5.0</p>
              </div>
              <Star className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Util</p>
                <p className="text-2xl font-bold mt-1">{metrics.helpfulRate}%</p>
                <p className="text-xs text-green-600 mt-1">{metrics.helpfulCount} sim</p>
              </div>
              <ThumbsUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Nao Util</p>
                <p className="text-2xl font-bold mt-1">{metrics.notHelpfulCount}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rating Distribution */}
        {ratingData.length > 0 && (
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Distribuição de Avaliações</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ratingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stars" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Sentiment Distribution */}
        {sentimentData.length > 0 && (
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Sentimento</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sentimentData.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* By Email Type */}
      {byEmailType && Object.keys(byEmailType).length > 0 && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Feedback por Tipo de Email</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(byEmailType).map(([type, data]: [string, any]) => (
              <div key={type} className="border rounded-lg p-4">
                <p className="font-semibold text-sm mb-2 capitalize">{type}</p>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-600">Feedbacks:</span> {data.count}</p>
                  <p><span className="text-gray-600">Avaliação:</span> {data.avgRating}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
