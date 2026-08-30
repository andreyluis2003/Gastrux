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
  AlertCircle,
} from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface DishProfitability {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  margin: number;
  marginPercentage: number;
  quantitySold: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
}

interface ProfitabilityReport {
  period: string;
  totalProfit: number;
  averageMargin: number;
  dishes: DishProfitability[];
  topProfitable: DishProfitability[];
  lowMargin: DishProfitability[];
}

export default function ProfitabilityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ProfitabilityReport | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<'margin' | 'profit'>('profit');

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
        `/api/reports/profitability?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`
      );

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error('Erro ao carregar relatorio');
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
        `/api/reports/profitability/export?startDate=${startDate}&endDate=${endDate}&format=excel`
      );

      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lucratividade_${startDate}_${endDate}.xlsx`;
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

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Analise de Lucratividade</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Margem de lucro por prato e ingrediente
          </p>
        </div>
        <Button
          onClick={handleExport}
          disabled={exporting || !report}
          className="gap-2 w-full sm:w-auto"
        >
          <Download size={18} />
          {exporting ? 'Exportando...' : 'Exportar Excel'}
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
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Lucro Total</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatBRL(report.totalProfit)}
                </p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Margem Media</p>
                <p className="text-2xl font-bold text-primary">
                  {report.averageMargin.toFixed(1)}%
                </p>
              </div>
            </Card>
          </div>

          <Card className="p-6 border-green-200 bg-green-50">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-green-900">
              <TrendingUp size={20} />
              Pratos Mais Lucrativos
            </h3>
            <div className="space-y-3">
              {report.topProfitable.slice(0, 5).map((dish) => (
                <div
                  key={dish.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200"
                >
                  <div className="flex-1">
                    <p className="font-semibold">{dish.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Margem: {dish.marginPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">
                      {formatBRL(dish.profit)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dish.quantitySold} vendas
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {report.lowMargin.length > 0 && (
            <Card className="p-6 border-yellow-200 bg-yellow-50">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-yellow-900">
                <AlertCircle size={20} />
                Pratos com Margem Baixa
              </h3>
              <div className="space-y-3">
                {report.lowMargin.slice(0, 5).map((dish) => (
                  <div
                    key={dish.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-200"
                  >
                    <div className="flex-1">
                      <p className="font-semibold">{dish.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Margem: {dish.marginPercentage.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-yellow-600">
                        {formatBRL(dish.profit)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dish.quantitySold} vendas
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Todos os Pratos</h3>
            <div className="space-y-2">
              {report.dishes.map((dish) => (
                <div
                  key={dish.id}
                  className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 rounded-lg bg-muted text-sm"
                >
                  <div className="col-span-2 md:col-span-2">
                    <p className="font-semibold truncate">{dish.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margem</p>
                    <p className="font-semibold">{dish.marginPercentage.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vendas</p>
                    <p className="font-semibold">{dish.quantitySold}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Receita</p>
                    <p className="font-semibold">{formatBRL(dish.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro</p>
                    <p className="font-semibold text-green-600">{formatBRL(dish.profit)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}