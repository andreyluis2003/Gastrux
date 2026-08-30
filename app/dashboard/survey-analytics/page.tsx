'use client';

import { useState, useEffect } from 'react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import { TrendingUp, Users, DollarSign, Target, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface SurveyAnalytics {
  totalResponses: number;
  completionRate: number;
  averageCompletionTime: number;
  willingnessDistribution: { [key: string]: number };
  medianWtp: number;
  monetizeableSegment: number;
  topPainPoints: Array<{ pain: string; count: number; pct: number }>;
  topFeatures: Array<{ feature: string; score: number; pct: number }>;
  segmentationByUnits: { [key: string]: number };
  segmentationByRevenue: { [key: string]: number };
  totalWarmLeads: number;
  contactMethodDistribution: { [key: string]: number };
  lastUpdatedAt: string;
}

const PAIN_POINT_LABELS: { [key: string]: string } = {
  'manual_process': 'Processos Manuais',
  'slow_system': 'Sistema Lento',
  'no_reports': 'Falta de Relatórios',
  'high_cost': 'Preço Alto',
  'poor_support': 'Suporte Ruim',
  'no_offline': 'Sem Offline',
  'integration': 'Integração Difícil',
  'no_mobile': 'Sem Mobile',
  'inventory': 'Estoque Confuso',
};

const FEATURE_LABELS: { [key: string]: string } = {
  'fast_pos': 'POS Rápido',
  'offline': 'Funciona Offline',
  'low_price': 'Preço Baixo',
  'delivery': 'Integração Delivery',
  'reports': 'Relatórios',
  'kitchen_display': 'Kitchen Display',
  'inventory': 'Estoque Inteligente',
  'multi_branch': 'Múltiplas Filiais',
  'analytics': 'Analytics em Tempo Real',
};

export default function SurveyAnalyticsPage() {
  const [analytics, setAnalytics] = useState<SurveyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<any[]>([]);
  const [warmLeads, setWarmLeads] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const [analyticsRes, responsesRes, leadsRes] = await Promise.all([
        fetch('/api/survey/analytics'),
        fetch('/api/survey/responses'),
        fetch('/api/survey/warm-leads'),
      ]);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
      }

      if (responsesRes.ok) {
        const data = await responsesRes.json();
        setResponses(data.responses || []);
      }

      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setWarmLeads(data.leads || []);
      }
    } catch (error) {
      toast.error('Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (responses.length === 0) {
      toast.error('Nenhuma resposta para exportar');
      return;
    }

    const headers = [
      'Email',
      'Sistema Atual',
      'Principal Pain Point',
      'WTP (R$)',
      'Feature Prioritária',
      'Unidades',
      'Faturamento',
      'Funcionários',
      'Quer Falar',
      'Contato',
    ];

    const rows = responses.map(r => [
      r.user?.email || '',
      r.currentSystem || '',
      r.painPoints?.[0] || '',
      r.willingnessToPayRaw || '',
      r.mostImportantFeature || '',
      r.businessUnits || '',
      r.monthlyRevenue || '',
      r.employeeCount || '',
      r.willingToTalk ? 'Sim' : 'Não',
      r.contactInfo || '',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `survey-responses-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    toast.success('CSV exportado!');
  };

  if (loading) return <LoadingSkeleton />;

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 sm:space-y-6 sm:p-6">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Analytics do Survey</h1>
        </div>
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Nenhuma resposta de survey ainda</p>
          <p className="text-sm text-gray-500 mt-2">As respostas aparecerão aqui conforme os usuários completarem o survey</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Analytics do Survey</h1>
          <p className="text-sm text-gray-600 mt-1">Insights das {analytics.totalResponses} respostas coletadas</p>
        </div>
        <Button onClick={downloadCSV} className="w-full sm:w-auto">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Respostas</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{analytics.totalResponses}</h3>
            </div>
            <Users className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">WTP Mediano</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">R$ {(analytics.medianWtp / 100).toFixed(0)}</h3>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Monetizáveis (R$ 100+)</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{analytics.monetizeableSegment}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {analytics.totalResponses > 0 ? ((analytics.monetizeableSegment / analytics.totalResponses) * 100).toFixed(0) : '0'}% do total
              </p>
            </div>
            <Target className="w-8 h-8 text-orange-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Warm Leads</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{analytics.totalWarmLeads}</h3>
              <p className="text-xs text-gray-500 mt-1">Interessados em falar</p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Willingness to Pay Distribution */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Distribuição de Disponibilidade de Pagamento</h2>
        <div className="space-y-3">
          {Object.entries(analytics.willingnessDistribution).map(([wtp, count]) => {
            const labels: { [key: string]: string } = {
              'none': 'Não pagaria',
              '50': 'R$ 50/mês',
              '100': 'R$ 100/mês',
              '200': 'R$ 200/mês',
              '500': 'R$ 500+/mês',
            };
            const pct = ((count as number) / analytics.totalResponses) * 100;
            return (
              <div key={wtp}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{labels[wtp]}</span>
                  <span className="text-sm text-gray-600">{count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top Pain Points */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Top Pain Points</h2>
          <div className="space-y-3">
            {analytics.topPainPoints.map((pain, idx) => (
              <div key={pain.pain} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-red-700">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {PAIN_POINT_LABELS[pain.pain] || pain.pain}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className="bg-red-500 h-2 rounded-full"
                      style={{ width: `${pain.pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{pain.count} menções ({pain.pct}%)</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Features */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Features Mais Importantes</h2>
          <div className="space-y-3">
            {analytics.topFeatures.map((feature, idx) => (
              <div key={feature.feature} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-green-700">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {FEATURE_LABELS[feature.feature] || feature.feature}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${feature.pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Score: {feature.score} ({feature.pct}%)</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Métodos de Contato dos Warm Leads */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Métodos de Contato Preferidos (Warm Leads)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(analytics.contactMethodDistribution).map(([method, count]) => {
            const icons: { [key: string]: string } = {
              'whatsapp': '💬',
              'email': '📧',
              'phone': '☎️',
            };
            const pct = ((count as number) / analytics.totalWarmLeads) * 100;
            return (
              <Card key={method} className="p-4 border border-gray-200">
                <div className="text-center">
                  <div className="text-3xl mb-2">{icons[method]}</div>
                  <p className="font-semibold text-gray-900 capitalize">{method}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{count}</p>
                  <p className="text-xs text-gray-500 mt-1">{pct.toFixed(0)}% dos leads</p>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      {/* Warm Leads List */}
      {warmLeads.length > 0 && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Warm Leads ({warmLeads.length})</h2>
            <Link href="/dashboard/survey-leads">
              <Button variant="outline" size="sm">Ver Todos</Button>
            </Link>
          </div>
          <div className="space-y-3">
            {warmLeads.slice(0, 5).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{lead.user?.name || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{lead.user?.email}</p>
                  {lead.contactInfo && (
                    <p className="text-sm text-gray-500 mt-1">
                      {lead.preferredContact === 'whatsapp' && '💬'}
                      {lead.preferredContact === 'email' && '📧'}
                      {lead.preferredContact === 'phone' && '☎️'}
                      {' '}{lead.contactInfo}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm">
                  <p className="text-gray-600">
                    WTP: R$ {(lead.willingnessToPayBRL / 100).toFixed(0)}
                  </p>
                  {lead.followUpSentAt ? (
                    <p className="text-xs text-green-600 mt-1">✓ Follow-up enviado</p>
                  ) : (
                    <p className="text-xs text-orange-600 mt-1">Pendente follow-up</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
