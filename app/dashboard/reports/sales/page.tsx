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
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { formatBRL, formatDate } from '@/lib/formatters';

interface SalesReport {
  period: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  topDishes: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  byCategory: Array<{
    category: string;
    sales: number;
    percentage: number;
  }>;
}

export default function SalesReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [period, setPeriod] = useState('month');
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
        `/api/reports/sales?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`
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
        `/api/reports/sales/export?startDate=${startDate}&endDate=${endDate}&format=pdf`
      );

      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_vendas_${startDate}_${endDate}.pdf`;
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
            <h1 className="text-xl font-bold sm:text-3xl">Relatorio de Vendas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Analise de vendas por periodo e categoria
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
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total de Vendas</p>
                <p className="text-2xl font-bold">{formatBRL(report.totalSales)}</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total de Pedidos</p>
                <p className="text-2xl font-bold">{report.totalOrders}</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Ticket Medio</p>
                <p className="text-2xl font-bold">{formatBRL(report.averageTicket)}</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Periodo</p>
                <p className="text-lg font-bold truncate">{report.period}</p>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={20} />
              Top Pratos
            </h3>
            <div className="space-y-3">
              {report.topDishes.slice(0, 5).map((dish, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-semibold">{dish.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {dish.quantity} vendas
                    </p>
                  </div>
                  <p className="font-semibold text-primary">
                    {formatBRL(dish.revenue)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp size={20} />
              Vendas por Categoria
            </h3>
            <div className="space-y-3">
              {report.byCategory.map((cat, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{cat.category}</p>
                    <p className="text-sm font-semibold text-primary">
                      {cat.percentage.toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatBRL(cat.sales)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}