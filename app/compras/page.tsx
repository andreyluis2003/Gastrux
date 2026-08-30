'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Plus, ShoppingCart, Zap, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatDate, formatBRL } from '@/lib/formatters';
import { useI18n } from '@/lib/i18n';

export default function ComprasPage() {
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchLists();
  }, []);

  async function fetchLists() {
    try {
      const res = await fetch('/api/shopping-lists');
      if (!res.ok) throw new Error('Erro ao buscar listas');
      const data = await res.json();
      setLists(data);
    } catch (error) {
      toast.error('Erro ao carregar listas');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(autoGenerate: boolean) {
    try {
      setCreating(true);
      const res = await fetch('/api/shopping-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoGenerate, notes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao criar lista');
      }

      const newList = await res.json();
      setLists((prev) => [newList, ...prev]);
      setShowNewDialog(false);
      setNotes('');
      toast.success(
        autoGenerate
          ? `Lista gerada com ${newList.items?.length ?? 0} itens!`
          : 'Lista vazia criada com sucesso!'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao criar lista'
      );
    } finally {
      setCreating(false);
    }
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    ORDERED: { label: 'Pedido Feito', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    RECEIVED: { label: 'Recebido', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    PARTIAL: { label: 'Parcial', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
    CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton href="/dashboard" label={t('common.back')} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold truncate">{t('shopping.title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('shopping.subtitle')}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {t('shopping.new')}
        </Button>
      </div>

      {/* New List Dialog */}
      {showNewDialog && (
        <Card className="p-6 border-2 border-primary/20 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Criar Nova Lista de Compras</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowNewDialog(false);
                setNotes('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Observações (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Compras para a semana, Reposição urgente..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleCreate(true)}
              disabled={creating}
              className="flex flex-col items-center gap-3 p-5 rounded-lg border-2 border-dashed border-green-300 dark:border-green-700 hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all text-left"
            >
              {creating ? (
                <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
              ) : (
                <Zap className="h-8 w-8 text-green-600 dark:text-green-400" />
              )}
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  Gerar Automaticamente
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cria lista baseada nos ingredientes abaixo do estoque mínimo
                  com o fornecedor de menor preço
                </p>
              </div>
            </button>

            <button
              onClick={() => handleCreate(false)}
              disabled={creating}
              className="flex flex-col items-center gap-3 p-5 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
            >
              {creating ? (
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              ) : (
                <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              )}
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  Lista Vazia
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cria uma lista em branco para adicionar itens manualmente
                </p>
              </div>
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height="h-28" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <ShoppingCart className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600 dark:text-slate-400">
            Nenhuma lista de compras criada
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
            Clique em &quot;Nova Lista&quot; para começar
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {lists.map((list) => {
            const status = statusLabels[list.status] || {
              label: list.status,
              color: 'bg-slate-100 text-slate-800',
            };
            return (
              <Link key={list.id} href={`/compras/${list.id}`}>
                <Card className="cursor-pointer p-4 transition-all hover:shadow-lg">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">
                        {formatDate(new Date(list.listDate))}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {list.items?.length ?? 0} itens
                      </p>
                      {list.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 line-clamp-1 break-words">
                          {list.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${status.color}`}
                      >
                        {status.label}
                      </span>
                      <p className="text-base sm:text-lg font-semibold whitespace-nowrap">
                        {formatBRL(list.totalCost || 0)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}