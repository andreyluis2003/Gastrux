// @ts-nocheck
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Download,
  FileText,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Filter,
  Loader2,
  Search,
} from 'lucide-react';

interface PaymentRecord {
  id: string;
  amount: number;
  gateway: string;
  status: string;
  createdAt: string;
  platformFee: number;
  gatewayFee: number;
  netAmount: number;
  settlementStatus: string;
  description: string;
}

export default function ConciliacaoPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await fetch('/api/pagamentos?limit=500');
      const data = await response.json();
      setPayments(data.payments || []);
    } catch (error) {
      toast.error('Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const matchesGateway =
        gatewayFilter === 'all' || payment.gateway === gatewayFilter;
      const matchesStatus =
        statusFilter === 'all' || payment.status === statusFilter;
      const matchesSearch =
        !searchQuery ||
        payment.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        payment.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate =
        (!startDate || new Date(payment.createdAt) >= new Date(startDate)) &&
        (!endDate || new Date(payment.createdAt) <= new Date(endDate));

      return matchesGateway && matchesStatus && matchesSearch && matchesDate;
    });
  }, [payments, gatewayFilter, statusFilter, searchQuery, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredPayments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    const platformFees = filteredPayments.reduce(
      (sum, p) => sum + (Number(p.platformFee) || 0),
      0
    );
    const gatewayFees = filteredPayments.reduce(
      (sum, p) => sum + (Number(p.gatewayFee) || 0),
      0
    );
    const netTotal = filteredPayments.reduce(
      (sum, p) => sum + (Number(p.netAmount) || 0),
      0
    );

    const byGateway = filteredPayments.reduce((acc, p) => {
      acc[p.gateway] = (acc[p.gateway] || 0) + (Number(p.amount) || 0);
      return acc;
    }, {} as Record<string, number>);

    const byStatus = filteredPayments.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, platformFees, gatewayFees, netTotal, byGateway, byStatus };
  }, [filteredPayments]);

  const exportCSV = () => {
    const headers = [
      'ID',
      'Data',
      'Gateway',
      'Status',
      'Valor Bruto',
      'Taxa Plataforma',
      'Taxa Gateway',
      'Valor Líquido',
      'Descrição',
    ];

    const rows = filteredPayments.map((p) => [
      p.id,
      new Date(p.createdAt).toLocaleDateString('pt-BR'),
      p.gateway,
      p.status,
      p.amount.toFixed(2),
      (p.platformFee || 0).toFixed(2),
      (p.gatewayFee || 0).toFixed(2),
      (p.netAmount || p.amount).toFixed(2),
      p.description || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conciliacao-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório exportado com sucesso!');
  };

  const formatBRL = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const gatewayColors: Record<string, string> = {
    MERCADO_PAGO: 'bg-blue-100 text-blue-700',
    STRIPE: 'bg-purple-100 text-purple-700',
    STRIPE_CONNECT: 'bg-indigo-100 text-indigo-700',
    MANUAL: 'bg-gray-100 text-gray-700',
  };

  const statusColors: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
    refunded: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard/pagamentos" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Conciliação Bancária
              </h1>
              <p className="text-sm text-gray-500">
                Reconcilie seus recebimentos e taxas
              </p>
            </div>
          </div>
          <Button
            onClick={exportCSV}
            disabled={filteredPayments.length === 0}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Bruto</p>
                <p className="text-lg font-semibold">
                  {formatBRL(summary.total)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Taxas Totais</p>
                <p className="text-lg font-semibold">
                  {formatBRL(summary.platformFees + summary.gatewayFees)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Líquido</p>
                <p className="text-lg font-semibold">
                  {formatBRL(summary.netTotal)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Transações</p>
                <p className="text-lg font-semibold">
                  {filteredPayments.length}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Data Inicial
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Data Final
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Gateway
                </label>
                <select
                  value={gatewayFilter}
                  onChange={(e) => setGatewayFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="MERCADO_PAGO">Mercado Pago</option>
                  <option value="STRIPE">Stripe</option>
                  <option value="STRIPE_CONNECT">Stripe Connect</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="approved">Aprovado</option>
                  <option value="pending">Pendente</option>
                  <option value="rejected">Rejeitado</option>
                  <option value="refunded">Reembolsado</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="ID ou descrição"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* By Gateway Summary */}
        {Object.keys(summary.byGateway).length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(summary.byGateway).map(([gateway, amount]) => (
              <Card key={gateway} className="p-3">
                <p className="text-xs text-gray-500">{gateway}</p>
                <p className="text-sm font-semibold">{formatBRL(amount)}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Payments Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    Gateway
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">
                    Valor
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">
                    Taxas
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">
                    Líquido
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      Nenhum pagamento encontrado
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        {payment.id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(payment.createdAt).toLocaleDateString(
                          'pt-BR'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            gatewayColors[payment.gateway] ||
                            'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {payment.gateway}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColors[payment.status] ||
                            'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatBRL(payment.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {formatBRL(
                          (payment.platformFee || 0) + (payment.gatewayFee || 0)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatBRL(payment.netAmount || payment.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
