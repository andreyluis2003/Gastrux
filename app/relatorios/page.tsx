'use client';

import { useState } from 'react';
import { Button, Card, BackButton } from '@/components/ui';
import { Download, FileText, BarChart3, PieChart as PieChartIcon, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [includeRecipes, setIncludeRecipes] = useState(false);

  const reports: ReportType[] = [
    {
      id: 'cmv',
      name: 'CMV (Custo de Mercadoria Vendida)',
      description: 'Análise detalhada de custos e insumos utilizados',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'bg-blue-50 border-blue-200',
    },
    {
      id: 'menu-engineering',
      name: 'Engenharia de Cardápio',
      description: 'Classificação BCG (STAR, WORKHORSE, PUZZLE, DOG)',
      icon: <PieChartIcon className="w-6 h-6" />,
      color: 'bg-purple-50 border-purple-200',
    },
    {
      id: 'waste',
      name: 'Desperdício e Perdas',
      description: 'Análise de resíduos por ingrediente e motivo',
      icon: <Zap className="w-6 h-6" />,
      color: 'bg-red-50 border-red-200',
    },
    {
      id: 'comprehensive',
      name: 'Relatório Executivo Completo',
      description: 'Combina CMV, Menu Engineering e Desperdício',
      icon: <FileText className="w-6 h-6" />,
      color: 'bg-green-50 border-green-200',
    },
  ];

  const handleGenerateReport = async () => {
    if (!selectedReport) {
      toast.error('Selecione um tipo de relatório');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        reportType: selectedReport,
        days,
        includeRecipes,
      };

      const response = await fetch('/api/reports/executive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Erro ao gerar relatório');

      // Download PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${selectedReport}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Relatório gerado com sucesso!');
      setSelectedReport(null);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-4 sm:space-y-6 sm:p-6">
      <div>
        <BackButton />
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mt-2">Relatórios Executivos</h1>
        <p className="text-sm text-gray-600 mt-1">Gere relatórios profissionais em PDF para análise e apresentação</p>
      </div>

      {/* Report Selection */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">Escolha o tipo de relatório:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map(report => (
            <Card
              key={report.id}
              className={`p-4 cursor-pointer transition border-2 ${
                selectedReport === report.id
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-transparent hover:border-gray-300'
              }`}
              onClick={() => setSelectedReport(report.id)}
            >
              <div className="flex items-start gap-3">
                <div className="text-gray-600 mt-1">{report.icon}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{report.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Options */}
      {selectedReport && (
        <Card className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Período de análise
            </label>
            <div className="flex gap-2">
              {[7, 14, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-2 rounded text-sm font-medium transition ${
                    days === d
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {selectedReport === 'comprehensive' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="include-recipes"
                checked={includeRecipes}
                onChange={e => setIncludeRecipes(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="include-recipes" className="text-sm text-gray-700">
                Incluir detalhes de receitas
              </label>
            </div>
          )}
        </Card>
      )}

      {/* Action Button */}
      <Button
        onClick={handleGenerateReport}
        disabled={!selectedReport || loading}
        className={`w-full ${!selectedReport ? 'opacity-50 cursor-not-allowed' : ''}`}
        size="lg"
      >
        <Download className="w-4 h-4 mr-2" />
        {loading ? 'Gerando relatório...' : 'Gerar e Baixar Relatório (PDF)'}
      </Button>

      {/* Info */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>Dica:</strong> Os relatórios são gerados em PDF com formatação profissional, pronto para apresentação aos stakeholders ou para arquivo.
        </p>
      </Card>
    </div>
  );
}
