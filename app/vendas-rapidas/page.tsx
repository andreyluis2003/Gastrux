'use client';

import { useState, useEffect } from 'react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import { Plus, TrendingUp, DollarSign, ShoppingBag, Clock } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatBRL, formatDate, formatDateTime } from '@/lib/formatters';

interface POSTransaction {
  id: string;
  transactionId: string;
  provider: string;
  amount: number;
  paymentMethod: string;
  status: string;
  items: any[];
  transactionDate: string;
  notes?: string;
}

interface POSSummary {
  totalSales: number;
  transactionCount: number;
  averageTransaction: number;
  completedCount: number;
  failedCount: number;
}

export default function VendasRapidasPage() {
  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [summary, setSummary] = useState<POSSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'pending'>('all');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pos/transactions?days=7');
      const data = await response.json();
      
      if (data.transactions) {
        setTransactions(data.transactions);
      }
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Erro ao carregar transações:', error);
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'all') return true;
    return t.status.toLowerCase() === filter;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'REFUNDED':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'COMPLETED': 'Concluído',
      'PENDING': 'Pendente',
      'FAILED': 'Falhou',
      'REFUNDED': 'Reembolsado',
      'CANCELLED': 'Cancelado',
    };
    return labels[status] || status;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mt-2">Vendas Rápidas (POS)</h1>
          <p className="text-sm text-gray-600 mt-1">Últimas 7 dias de transações</p>
        </div>
        <Link href="/settings/pos">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Configurar POS
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total de Vendas</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{formatBRL(summary.totalSales)}</h3>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total de Transações</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{summary.transactionCount}</h3>
              </div>
              <ShoppingBag className="w-8 h-8 text-blue-500" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Ticket Médio</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{formatBRL(summary.averageTransaction)}</h3>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Concluídas</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{summary.completedCount}</h3>
              </div>
              <Clock className="w-8 h-8 text-purple-500" />
            </div>
          </Card>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {/* Filters */}
      {!loading && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'completed', 'pending', 'failed'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="text-sm"
            >
              {f === 'all' ? 'Todas' : f === 'completed' ? 'Concluídas' : f === 'pending' ? 'Pendentes' : 'Falhadas'}
            </Button>
          ))}
        </div>
      )}

      {/* Transactions List */}
      {!loading && filteredTransactions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500 text-lg">Nenhuma transação encontrada</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map(transaction => (
            <Card key={transaction.id} className="p-4">
              <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{transaction.provider}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusBadgeColor(transaction.status)}`}>
                      {getStatusLabel(transaction.status)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">ID: {transaction.transactionId}</p>
                  <p className="text-sm text-gray-500 mt-1">{formatDateTime(new Date(transaction.transactionDate))}</p>
                  {transaction.notes && <p className="text-sm text-gray-500 mt-1 italic">Nota: {transaction.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatBRL(transaction.amount)}</p>
                  <p className="text-sm text-gray-600">{transaction.paymentMethod}</p>
                  {transaction.items.length > 0 && (
                    <p className="text-sm text-gray-500 mt-1">{transaction.items.length} item(ns)</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
