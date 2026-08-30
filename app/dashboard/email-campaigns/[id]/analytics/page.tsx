'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { ArrowUp, TrendingUp, Users, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface SegmentAnalytics {
  segmentId: string;
  segmentType: string;
  segmentName: string;
  targetUserCount: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalConverted: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  variantMetrics: any[];
}

interface CampaignAnalytics {
  campaignId: string;
  campaignName: string;
  status: string;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalConverted: number;
  overallOpenRate: number;
  overallClickRate: number;
  overallConversionRate: number;
  analyticsBySegment: SegmentAnalytics[];
}

export default function CampaignAnalyticsPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(
        `/api/admin/campaigns/${campaignId}/analytics`
      );
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSegment = (segmentId: string) => {
    const newExpanded = new Set(expandedSegments);
    if (newExpanded.has(segmentId)) {
      newExpanded.delete(segmentId);
    } else {
      newExpanded.add(segmentId);
    }
    setExpandedSegments(newExpanded);
  };

  const renderMetricCard = (label: string, value: number | string, icon: any, isPercentage = false) => (
    <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-600">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">
            {typeof value === 'number' && isPercentage
              ? value.toFixed(1)
              : value}
            {isPercentage ? '%' : ''}
          </p>
        </div>
        <div className="text-blue-600">{icon}</div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
          <Card className="text-center p-8">
            <h2 className="text-lg font-semibold">Dados não disponíveis</h2>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <BackButton href="/dashboard/email-campaigns" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Analytics: {analytics.campaignName}
            </h1>
            <p className="text-sm text-gray-600">
              Performance por segmento e variante
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {renderMetricCard(
            'Total Enviados',
            analytics.totalSent,
            <Mail className="h-6 w-6" />
          )}
          {renderMetricCard(
            'Taxa Abertura',
            analytics.overallOpenRate,
            <TrendingUp className="h-6 w-6" />,
            true
          )}
          {renderMetricCard(
            'Taxa Clique',
            analytics.overallClickRate,
            <ArrowUp className="h-6 w-6" />,
            true
          )}
          {renderMetricCard(
            'Conversões',
            analytics.totalConverted,
            <Users className="h-6 w-6" />
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Performance por Segmento</h2>
          {analytics.analyticsBySegment.map((segment) => (
            <Card key={segment.segmentId} className="overflow-hidden">
              <button
                onClick={() => toggleSegment(segment.segmentId)}
                className="w-full p-4 sm:p-6 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {segment.segmentName}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {segment.targetUserCount} usuários alvo
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-6 text-right">
                  <div className="hidden sm:block">
                    <p className="text-xs text-gray-600">Enviados</p>
                    <p className="font-semibold">{segment.totalSent}</p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs text-gray-600">Taxa Abertura</p>
                    <p className="font-semibold text-blue-600">
                      {segment.openRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs text-gray-600">Taxa Clique</p>
                    <p className="font-semibold text-green-600">
                      {segment.clickRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Conv</p>
                      <p className="font-semibold text-purple-600">
                        {segment.totalConverted}
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {expandedSegments.has(segment.segmentId) && (
                <div className="border-t p-4 sm:p-6 bg-gray-50 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-xs text-gray-600">Enviados</p>
                      <p className="text-lg font-bold">{segment.totalSent}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-xs text-gray-600">Aberturas</p>
                      <p className="text-lg font-bold text-blue-600">
                        {segment.totalOpened}
                      </p>
                    </div>
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-xs text-gray-600">Cliques</p>
                      <p className="text-lg font-bold text-green-600">
                        {segment.totalClicked}
                      </p>
                    </div>
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-xs text-gray-600">Conversões</p>
                      <p className="text-lg font-bold text-purple-600">
                        {segment.totalConverted}
                      </p>
                    </div>
                  </div>

                  {segment.variantMetrics && segment.variantMetrics.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Performance das Variantes
                      </h4>
                      <div className="space-y-2">
                        {segment.variantMetrics.map((variant: any) => (
                          <div
                            key={variant.variantId}
                            className="p-3 bg-white rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-medium">
                                Variante {variant.variantName}
                              </p>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                {variant.sentCount} enviados
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-gray-600">Abertura</p>
                                <p className="font-semibold text-blue-600">
                                  {variant.openRate.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600">Clique</p>
                                <p className="font-semibold text-green-600">
                                  {variant.clickRate.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600">Conversão</p>
                                <p className="font-semibold text-purple-600">
                                  {variant.conversionRate.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
