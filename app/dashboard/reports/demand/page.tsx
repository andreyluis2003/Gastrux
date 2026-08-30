'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button,
  Card,
  Input,
  Label,
  BackButton,
  LoadingSkeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import {
  Download,
  Filter,
  TrendingUp,
  Calendar,
  Info,
} from 'lucide-react';

interface DemandForecast {
  date: string;
  dayOfWeek: string;
  forecast: number;
  confidence: number;
  historical: Array<{
    date: string;
    quantity: number;
  }>;
}

interface DishDemand {
  id: string;
  name: string;
  currentTrend: 'increasing' | 'stable' | 'decreasing';
  forecastQuantity: number;
  averageSales: number;
  variance: number;
  recommendation: string;
}

interface DemandReport {
  period: string;
  nextWeekForecast: DemandForecast[];
  dishDemands: DishDemand[];
  peakDays: string[];
  slowDays: string[];
}

export default function DemandPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DemandReport | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  useEffect(() => {
    const today = new Date();
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    
    setStartDate(monthAgo.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
    fetchReport(monthAgo, today);
  }, []);

  const fetchReport = async (start: Date, end: Date) => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/reports/demand?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`
      );

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error('Erro ao carregar previsoes');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      toast.error('Data inicial deve ser menor que data final');
      return;
    }
    fetchReport(start, end);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch(
        `/api/reports/demand/export?startDate=${startDate}&endDate=${endDate}&format=pdf`
      );

      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `previsao_demanda_${startDate}_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Relatorio exportado com sucesso');
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Erro ao exportar relatorio');
    } finally {
      setExporting(false);
    }
  };

  const getTrendColor = (trend: 'increasing' | 'stable' | 'decreasing') => {
    switch (trend) {
      case 'increasing':
        return 'text-green-600';
      case 'stable':
        return 'text-blue-600';
      case 'decreasing':
        return 'text-red-600';
    }
  };

  const getTrendLabel = (trend: 'increasing' | 'stable' | 'decreasing') => {
    switch (trend) {
      case 'increasing':
        return 'Crescendo';
      case 'stable':
        return 'Estavel';
      case 'decreasing':
        return 'Decrescendo';
    }
  };

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Previsao de Demanda</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Tendências e predições baseadas em dados históricos
          </p>
        </div>
        <Button
          onClick={handleExport}
          disabled={exporting || !report}
          className="gap-2 w-full sm:w-auto"
        >
          <Download size={18} />
          {exporting ? 'Exportando...' : 'Exportar PDF'}
        </Button>
      </div>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Filtros</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="startDate">Data Inicial</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">Data Final</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 flex items-end">
            <Button
              onClick={handleFilterChange}
              className="w-full gap-2"
            >
              <Filter size={18} />
              Aplicar Filtro
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : report ? (
        <div className="space-y-6">
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar size={20} />
              Previsao Proxima Semana
            </h3>
            <div className="grid gap-2 md:grid-cols-7">
              {report.nextWeekForecast.map((forecast, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-white border border-blue-100 text-center"
                >
                  <p className="text-xs font-semibold text-muted-foreground">
                    {forecast.dayOfWeek}
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {forecast.forecast}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {forecast.confidence.toFixed(0)}% confianca
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4 bg-green-50 border-green-200">
              <h3 className="font-semibold mb-3 text-green-900">Dias de Pico</h3>
              <div className="space-y-2">
                {report.peakDays.map((day, idx) => (
                  <p key={idx} className="text-sm font-semibold text-green-700">
                    • {day}
                  </p>
                ))}
              </div>
            </Card>
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <h3 className="font-semibold mb-3 text-yellow-900">Dias Lentos</h3>
              <div className="space-y-2">
                {report.slowDays.map((day, idx) => (
                  <p key={idx} className="text-sm font-semibold text-yellow-700">
                    • {day}
                  </p>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp size={20} />
              Tendências por Prato
            </h3>
            <div className="space-y-3">
              {report.dishDemands.map((dish) => (
                <div
                  key={dish.id}
                  className="p-4 rounded-lg bg-muted space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{dish.name}</p>
                    <span
                      className={`text-sm font-bold ${getTrendColor(
                        dish.currentTrend
                      )}`}
                    >
                      {getTrendLabel(dish.currentTrend)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Previsao</p>
                      <p className="font-semibold">{dish.forecastQuantity}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Media Historica</p>
                      <p className="font-semibold">{dish.averageSales.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Variação</p>
                      <p className="font-semibold">
                        {dish.variance.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-background border border-border">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold">Recomendação:</span> {dish.recommendation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-blue-50 border-blue-200 flex gap-3">
            <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Como usar as previsoes?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Planeje o estoque baseado na previsao de demanda</li>
                <li>Ajuste a equipe de preparo nos dias de pico</li>
                <li>Use promoções nos dias lentos para aumentar vendas</li>
                <li>Acompanhe as tendências para otimizar seu cardápio</li>
              </ul>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}