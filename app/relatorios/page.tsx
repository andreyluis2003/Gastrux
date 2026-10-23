'use client';

import { useState } from 'react';
import { Button, Card, BackButton } from '@/components/ui';
import { ExternalLink, FileText, BarChart3, PieChart as PieChartIcon, Zap } from 'lucide-react';
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
      description: 'O CMV da DRE e os itens que mais pesam no custo',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'bg-blue-50 border-blue-200',
    },
    {
      id: 'menu-engineering',
      name: 'Engenharia de Cardápio',
      description: 'Estrela, Cavalo de Batalha, Enigma e Abacaxi, pelas vendas',
      icon: <PieChartIcon className="w-6 h-6" />,
      color: 'bg-purple-50 border-purple-200',
    },
    {
      id: 'waste',
      name: 'Desperdício e Perdas',
      description: 'Desperdício por motivo e por insumo',
      icon: <Zap className="w-6 h-6" />,
      color: 'bg-red-50 border-red-200',
    },
    {
      id: 'comprehensive',
      name: 'Relatório Executivo Completo (Business)',
      description: 'Resumo, CMV, engenharia de cardápio e desperdício',
      icon: <FileText className="w-6 h-6" />,
      color: 'bg-green-50 border-green-200',
    },
  ];

  // A page to print or save as PDF (lib/reports/executive.ts): the tab opens on the click, so the browser
  // does not block it, and closes again if the report is refused
  const handleGenerateReport = async () => {
    if (!selectedReport) {
      toast.error('Selecione um tipo de relatório');
      return;
    }
    const tab = window.open('', '_blank');
    try {
      setLoading(true);
      const params = new URLSearchParams({ type: selectedReport, days: String(days), recipes: includeRecipes ? '1' : '0' });
      const response = await fetch(`/api/reports/executive?${params}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || 'Erro ao gerar relatório');
      }
      const html = await response.text();
      if (!tab) {
        toast.error('O navegador bloqueou a nova aba. Permita pop-ups para o Gastrux e tente de novo.');
        return;
      }
      tab.document.open();
      tab.document.write(html);
      tab.document.close();
    } catch (error: any) {
      tab?.close();
      toast.error(error.message || 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-4 sm:space-y-6 sm:p-6">
      <div>
        <BackButton />
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mt-2">Relatório executivo (PDF)</h1>
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

          {(selectedReport === 'comprehensive' || selectedReport === 'menu-engineering') && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="include-recipes"
                checked={includeRecipes}
                onChange={e => setIncludeRecipes(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="include-recipes" className="text-sm text-gray-700">
                Incluir a recomendação de cada item do cardápio
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
        <ExternalLink className="w-4 h-4 mr-2" />
        {loading ? 'Gerando relatório...' : 'Abrir relatório'}
      </Button>

      {/* Info */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>Dica:</strong> o relatório abre numa nova aba. Toque em <strong>Imprimir ou salvar em PDF</strong> e escolha "Salvar como PDF" para guardar o arquivo.
        </p>
      </Card>
    </div>
  );
}
