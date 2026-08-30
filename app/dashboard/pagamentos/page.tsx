'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';
import {
  CreditCard, Wallet, ArrowUpRight, ArrowDownRight, RefreshCw,
  QrCode, Building2, CircleDollarSign, ChevronRight, Loader2,
  FileText, Bell, ScanLine
} from 'lucide-react';

interface Payment {
  id: string;
  gateway: string;
  amount: number;
  status: string;
  method: string;
  description: string;
  customerEmail: string;
  createdAt: string;
  mercadoPagoData?: { initPoint?: string };
  stripeData?: { stripePaymentIntentId?: string };
  refunds: Array<{ amount: number; status: string }>;
}

interface Analytics {
  totalRevenue: number;
  totalTransactions: number;
  averageAmount: number;
  byGateway: Array<{ gateway: string; amount: number; count: number }>;
  byStatus: Array<{ status: string; count: number; amount: number }>;
}

export default function PagamentosDashboardPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/pagamentos/unified?limit=20');
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (err) {
      toast.error('Erro ao carregar pagamentos');
    }
  };

  const fetchAnalytics = async () => {
    try {
      // Placeholder - analytics endpoint to be created
      setAnalytics({
        totalRevenue: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        totalTransactions: payments.length,
        averageAmount: payments.length > 0 ? payments.reduce((sum, p) => sum + Number(p.amount), 0) / payments.length : 0,
        byGateway: [],
        byStatus: [],
      });
    } catch (err) {
      console.error('Analytics error:', err);
    }
  };

  useEffect(() => {
    fetchData().then(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [payments]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      APPROVED: 'bg-green-100 text-green-800',
      SETTLED: 'bg-blue-100 text-blue-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      PROCESSING: 'bg-orange-100 text-orange-800',
      DECLINED: 'bg-red-100 text-red-800',
      REFUNDED: 'bg-purple-100 text-purple-800',
      PARTIALLY_REFUNDED: 'bg-indigo-100 text-indigo-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
      CHARGEBACK: 'bg-red-200 text-red-900',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getGatewayIcon = (gateway: string) => {
    switch (gateway) {
      case 'MERCADO_PAGO': return <QrCode className="w-4 h-4" />;
      case 'STRIPE_CONNECT': return <CreditCard className="w-4 h-4" />;
      default: return <CircleDollarSign className="w-4 h-4" />;
    }
  };

  const filteredPayments = payments.filter(p => {
    if (selectedGateway !== 'all' && p.gateway !== selectedGateway) return false;
    if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Pagamentos</h1>
              <p className="text-sm text-gray-500">Gerencie recebimentos, reembolsos e conciliação</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" asChild>
              <a href="/dashboard/billing">
                <Building2 className="w-4 h-4 mr-2" />
                Configurar Gateways
              </a>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 font-medium">Receita Total</p>
                  <p className="text-2xl font-bold text-green-900">
                    {formatBRL(analytics.totalRevenue)}
                  </p>
                </div>
                <ArrowUpRight className="w-8 h-8 text-green-600" />
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-700 font-medium">Transações</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {analytics.totalTransactions}
                  </p>
                </div>
                <Wallet className="w-8 h-8 text-blue-600" />
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 font-medium">Ticket Médio</p>
                  <p className="text-2xl font-bold text-amber-900">
                    {formatBRL(analytics.averageAmount)}
                  </p>
                </div>
                <CircleDollarSign className="w-8 h-8 text-amber-600" />
              </div>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a href="/dashboard/pagamentos/checkout" className="block">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                  <ScanLine className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Checkout PIX</p>
                  <p className="text-sm text-gray-500">Gerar QR Code para recebimento</p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-gray-400" />
              </div>
            </Card>
          </a>
          <a href="/dashboard/pagamentos/conciliacao" className="block">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Conciliação</p>
                  <p className="text-sm text-gray-500">Reconcilie recebimentos e taxas</p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-gray-400" />
              </div>
            </Card>
          </a>
          <a href="/dashboard/pagamentos/alertas" className="block">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <Bell className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Alertas</p>
                  <p className="text-sm text-gray-500">Chargebacks, falhas e disputas</p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-gray-400" />
              </div>
            </Card>
          </a>
        </div>

        {/* Gateway Status */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Gateways Configurados</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <QrCode className="w-8 h-8 text-blue-600" />
              <div className="flex-1">
                <p className="font-medium text-blue-900">Mercado Pago</p>
                <p className="text-sm text-blue-600">PIX, Cartão, Boleto, Wallet</p>
              </div>
              <span className="px-2 py-1 bg-blue-200 text-blue-800 text-xs rounded-full font-medium">
                Prioridade
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <CreditCard className="w-8 h-8 text-purple-600" />
              <div className="flex-1">
                <p className="font-medium text-purple-900">Stripe Connect</p>
                <p className="text-sm text-purple-600">Cartão, PIX, Transferências</p>
              </div>
              <span className="px-2 py-1 bg-purple-200 text-purple-800 text-xs rounded-full font-medium">
                Clientes+
              </span>
            </div>
          </div>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedGateway}
            onChange={e => setSelectedGateway(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white"
          >
            <option value="all">Todos os Gateways</option>
            <option value="MERCADO_PAGO">Mercado Pago</option>
            <option value="STRIPE_CONNECT">Stripe Connect</option>
            <option value="MANUAL">Manual</option>
          </select>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white"
          >
            <option value="all">Todos os Status</option>
            <option value="APPROVED">Aprovado</option>
            <option value="PENDING">Pendente</option>
            <option value="PROCESSING">Processando</option>
            <option value="DECLINED">Recusado</option>
            <option value="REFUNDED">Reembolsado</option>
          </select>
        </div>

        {/* Payments Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Gateway</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Valor</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Descrição</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Nenhum pagamento encontrado
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map(payment => (
                    <tr key={payment.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {payment.id.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          {getGatewayIcon(payment.gateway)}
                          <span className="text-xs">{payment.gateway.replace('_', ' ')}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatBRL(payment.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                        {payment.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(payment.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/dashboard/pagamentos/${payment.id}`}>
                            <ChevronRight className="w-4 h-4" />
                          </a>
                        </Button>
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
