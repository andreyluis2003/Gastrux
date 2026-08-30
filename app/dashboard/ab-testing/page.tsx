'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { BarChart3, Play, Pause, TrendingUp, Mail, Users } from 'lucide-react';
import { formatDate } from '@/lib/formatters';

interface ABTest {
  id: string;
  name: string;
  emailType: string;
  status: string;
  createdAt: string;
  variants: Array<{
    name: string;
    percentage: number;
    sentCount: number;
    openCount: number;
    clickCount: number;
    conversionCount: number;
  }>;
  metrics: {
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    totalConversions: number;
    openRate: string;
    clickRate: string;
    conversionRate: string;
  };
}

export default function ABTestingPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTest, setShowNewTest] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/email/ab-tests/list');
      if (res.ok) {
        const data = await res.json();
        setTests(data.tests || []);
      }
    } catch (error) {
      console.error('Error fetching tests:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl sm:text-3xl font-bold">A/B Testing de E-mails</h1>
          </div>
          <Button
            onClick={() => setShowNewTest(true)}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
          >
            <Mail className="w-4 h-4 mr-2" />
            Novo Teste
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <BarChart3 className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-sm text-slate-400">Testes Totais</p>
                <p className="text-2xl font-bold">{tests.length}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <Play className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-sm text-slate-400">Ativos</p>
                <p className="text-2xl font-bold">{tests.filter((t) => t.status === 'running').length}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <Users className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-sm text-slate-400">E-mails Enviados</p>
                <p className="text-2xl font-bold">
                  {tests.reduce((sum, t) => sum + (t.metrics?.totalSent || 0), 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600 p-6">
            <div className="flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-sm text-slate-400">Taxa Conversão Média</p>
                <p className="text-2xl font-bold">
                  {
                    tests.length > 0
                      ? (
                          tests.reduce((sum, t) => sum + parseFloat(t.metrics?.conversionRate || '0'), 0) /
                          tests.length
                        ).toFixed(2)
                      : '0'
                  }
                  %
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tests List */}
        <div className="space-y-4">
          {loading ? (
            <Card className="bg-slate-700/50 border-slate-600 p-8 text-center text-slate-400">
              Carregando testes...
            </Card>
          ) : tests.length === 0 ? (
            <Card className="bg-slate-700/50 border-slate-600 p-8 text-center text-slate-400">
              Nenhum teste de A/B criado ainda
            </Card>
          ) : (
            tests.map((test) => (
              <Card
                key={test.id}
                className="bg-slate-700/50 border-slate-600 p-6 hover:border-slate-500 transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/ab-testing/${test.id}`)}
              >
                <div className="space-y-4">
                  {/* Test Header */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{test.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300">
                          {test.emailType}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            test.status === 'running'
                              ? 'bg-green-500/20 text-green-300'
                              : test.status === 'completed'
                              ? 'bg-slate-500/20 text-slate-300'
                              : 'bg-yellow-500/20 text-yellow-300'
                          }`}
                        >
                          {test.status === 'running' ? 'Em andamento' : test.status === 'completed' ? 'Concluído' : 'Rascunho'}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400">{formatDate(new Date(test.createdAt))}</p>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-slate-800/50 rounded p-4">
                      <p className="text-xs text-slate-400 mb-1">Enviados</p>
                      <p className="text-xl font-bold">{test.metrics.totalSent}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded p-4">
                      <p className="text-xs text-slate-400 mb-1">Taxa Abertura</p>
                      <p className="text-xl font-bold text-blue-400">{test.metrics.openRate}%</p>
                    </div>
                    <div className="bg-slate-800/50 rounded p-4">
                      <p className="text-xs text-slate-400 mb-1">Taxa Clique</p>
                      <p className="text-xl font-bold text-purple-400">{test.metrics.clickRate}%</p>
                    </div>
                    <div className="bg-slate-800/50 rounded p-4">
                      <p className="text-xs text-slate-400 mb-1">Taxa Conversão</p>
                      <p className="text-xl font-bold text-green-400">{test.metrics.conversionRate}%</p>
                    </div>
                  </div>

                  {/* Variants Preview */}
                  <div className="flex flex-wrap gap-2">
                    {test.variants.map((variant) => (
                      <div key={variant.name} className="bg-slate-800/50 rounded px-3 py-2 text-sm">
                        <p className="font-semibold">Variante {variant.name}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {variant.sentCount} enviados · {variant.percentage}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
