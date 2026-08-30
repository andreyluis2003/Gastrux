'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';

interface CashFlowRecord {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT';
  category: string;
  amount: number;
  description?: string;
  date: string;
  status: string;
  payment?: {
    id: string;
    method: string;
    status: string;
  };
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR');
};

export default function CashFlowPage() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CashFlowRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'INCOME',
    category: '',
    amount: '',
    description: '',
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/financial/cash-flow?status=COMPLETED');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRecords(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecord = async () => {
    if (!formData.category || !formData.amount) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const res = await fetch('/api/financial/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
        }),
      });

      if (!res.ok) throw new Error('Failed to create');
      const newRecord = await res.json();
      setRecords([newRecord, ...records]);
      setFormData({ type: 'INCOME', category: '', amount: '', description: '' });
      setShowForm(false);
      toast.success('Registro criado com sucesso');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao criar registro');
    }
  };

  const totalIncome = records
    .filter((r) => r.type === 'INCOME')
    .reduce((sum, r) => sum + r.amount, 0);

  const totalExpense = records
    .filter((r) => r.type === 'EXPENSE')
    .reduce((sum, r) => sum + r.amount, 0);

  const netFlow = totalIncome - totalExpense;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Fluxo de Caixa</h1>
            <p className="text-sm text-gray-600 mt-1">Controle de entradas e saídas</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Novo Registro
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-green-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Entradas</p>
              <p className="text-2xl font-bold text-green-600 mt-2">
                {formatBRL(totalIncome)}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-300" />
          </div>
        </Card>

        <Card className="p-6 bg-red-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Saídas</p>
              <p className="text-2xl font-bold text-red-600 mt-2">
                {formatBRL(totalExpense)}
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-300" />
          </div>
        </Card>

        <Card className={`p-6 ${netFlow >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Líquido</p>
              <p
                className={`text-2xl font-bold mt-2 ${
                  netFlow >= 0 ? 'text-blue-600' : 'text-orange-600'
                }`}
              >
                {formatBRL(netFlow)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-gray-300" />
          </div>
        </Card>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="p-6 bg-gray-50">
          <h2 className="text-lg font-semibold mb-4">Novo Registro</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="INCOME">Entrada</option>
                <option value="EXPENSE">Saída</option>
                <option value="ADJUSTMENT">Ajuste</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Categoria</label>
              <input
                type="text"
                placeholder="Ex: Vendas, Pagamento de Fornecedor"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Valor</label>
              <input
                type="number"
                placeholder="0.00"
                step="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Descrição</label>
              <textarea
                placeholder="Descrição adicional (opcional)"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg h-20 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddRecord} className="flex-1">
                Salvar
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Records List */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Registros Recentes</h2>
        {loading ? (
          <div className="text-center text-gray-500">Carregando...</div>
        ) : records.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <Card key={record.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {record.type === 'INCOME' ? (
                        <div className="p-2 bg-green-100 rounded">
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        </div>
                      ) : (
                        <div className="p-2 bg-red-100 rounded">
                          <TrendingDown className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{record.category}</p>
                        {record.description && (
                          <p className="text-xs text-gray-600">
                            {record.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(record.date)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p
                      className={`font-bold text-sm ${
                        record.type === 'INCOME'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {record.type === 'INCOME' ? '+' : '-'}
                      {formatBRL(record.amount)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
