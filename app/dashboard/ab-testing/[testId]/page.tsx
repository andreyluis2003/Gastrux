'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { ChevronLeft, TrendingUp, Mail, Users, BarChart3 } from 'lucide-react';
import { formatDate } from '@/lib/formatters';

interface VariantStats {
  id: string;
  name: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  conversionCount: number;
  openRate: string;
  clickRate: string;
  conversionRate: string;
}

interface ABTestDetail {
  id: string;
  name: string;
  emailType: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  variantStats: VariantStats[];
}

export default function ABTestDetailPage() {
  const [test, setTest] = useState<ABTestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const testId = params.testId as string;

  useEffect(() => {
    if (testId) {
      fetchTestDetails();
    }
  }, [testId]);

  const fetchTestDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/email/ab-tests/${testId}/results`);
      if (res.ok) {
        const data = await res.json();
        setTest(data.test);
      }
    } catch (error) {
      console.error('Error fetching test details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto text-center text-slate-400">Carregando...</div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto text-center text-slate-400">Teste não encontrado</div>
      </div>
    );
  }

  // Find winning variant based on conversion rate
  const winningVariant = test.variantStats.reduce((prev, current) =>
    parseFloat(current.conversionRate) > parseFloat(prev.conversionRate) ? current : prev
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold">{test.name}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {test.emailType} · {test.status === 'running' ? 'Em andamento' : test.status === 'completed' ? 'Concluído' : 'Rascunho'}
            </p>
          </div>
        </div>

        {/* Overall Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <Mail className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-sm text-slate-400">Total Enviados</p>
                <p className="text-2xl font-bold">
                  {test.variantStats.reduce((sum, v) => sum + v.sentCount, 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <Users className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-sm text-slate-400">Total Aberturas</p>
                <p className="text-2xl font-bold">
                  {test.variantStats.reduce((sum, v) => sum + v.openCount, 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <BarChart3 className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-sm text-slate-400">Total Cliques</p>
                <p className="text-2xl font-bold">
                  {test.variantStats.reduce((sum, v) => sum + v.clickCount, 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-sm text-slate-400">Conversões</p>
                <p className="text-2xl font-bold">
                  {test.variantStats.reduce((sum, v) => sum + v.conversionCount, 0)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Variants Comparison */}
        <Card className="bg-slate-700/50 border-slate-600 p-6">
          <h2 className="text-xl font-bold mb-6">Comparação de Variantes</h2>
          <div className="space-y-4">
            {test.variantStats.map((variant) => {
              const isWinner = variant.id === winningVariant.id;
              return (
                <div key={variant.name} className={`bg-slate-800/50 rounded-lg p-6 border-2 ${
                  isWinner ? 'border-green-500/50' : 'border-slate-600'
                }`}>
                  <div className="flex flex-col gap-4">
                    {/* Variant Header */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-bold">Variante {variant.name}</h3>
                        {isWinner && (
                          <span className="inline-block px-3 py-1 mt-2 rounded text-xs font-semibold bg-green-500/20 text-green-300">
                            🏆 Melhor Desempenho
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Enviados</p>
                        <p className="text-2xl font-bold">{variant.sentCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Aberturas</p>
                        <div>
                          <p className="text-2xl font-bold text-blue-400">{variant.openCount}</p>
                          <p className="text-sm text-slate-400">{variant.openRate}%</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Cliques</p>
                        <div>
                          <p className="text-2xl font-bold text-purple-400">{variant.clickCount}</p>
                          <p className="text-sm text-slate-400">{variant.clickRate}%</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Conversões</p>
                        <div>
                          <p className="text-2xl font-bold text-green-400">{variant.conversionCount}</p>
                          <p className="text-sm text-slate-400">{variant.conversionRate}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
