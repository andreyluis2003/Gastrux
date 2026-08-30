'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';

interface IngredientOption {
  id: string;
  name: string;
  code?: string | null;
  standardUnit?: string;
  category?: { name?: string | null } | null;
}

const MOVEMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'ENTRY', label: 'Entrada' },
  { value: 'MANUAL_DEDUCTION', label: 'Saída Manual' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'LOSS', label: 'Perda' },
];

export default function MovimentacaoEstoquePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingIngredients, setLoadingIngredients] = useState(true);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [formData, setFormData] = useState({
    ingredientId: '',
    quantity: '' as string,
    movementType: 'ENTRY',
    reason: '',
  });
  const fetchedOnce = useRef(false);

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    fetchIngredients();
  }, []);

  async function fetchIngredients() {
    setLoadingIngredients(true);
    try {
      const res = await fetch('/api/ingredients', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status !== 401) {
          throw new Error('Erro');
        }
        return;
      }
      const data = await res.json();
      setIngredients(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error instanceof Error && !error.message.includes('401')) {
        toast.error('Erro ao carregar insumos');
      }
    } finally {
      setLoadingIngredients(false);
    }
  }

  const filteredIngredients = useMemo(() => {
    const term = ingredientSearch.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter((ing) => {
      const name = (ing.name || '').toLowerCase();
      const code = (ing.code || '').toLowerCase();
      const category = (ing.category?.name || '').toLowerCase();
      return (
        name.includes(term) ||
        code.includes(term) ||
        category.includes(term)
      );
    });
  }, [ingredients, ingredientSearch]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === formData.ingredientId) || null,
    [ingredients, formData.ingredientId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const qty = parseFloat(formData.quantity);

    if (!formData.ingredientId) {
      toast.error('Selecione um insumo');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Informe uma quantidade válida');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/stock/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ingredientId: formData.ingredientId,
          quantity: qty,
          movementType: formData.movementType,
          reason: formData.reason,
        }),
      });

      if (!res.ok) throw new Error('Erro ao registrar movimentação');
      toast.success('Movimentação registrada com sucesso');
      router.push('/estoque');
      router.refresh();
    } catch (error) {
      toast.error('Erro ao registrar movimentação');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/estoque" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Nova Movimentação</h1>
          <p className="text-slate-600 dark:text-slate-400">Registrar movimento de estoque</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ingredient-search">Insumo</Label>

            {/* Searchable filter to narrow the insumo list */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
              <Input
                id="ingredient-search"
                type="text"
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="Buscar insumo por nome, código ou categoria..."
                className="pl-10 pr-10"
                aria-label="Buscar insumo"
                autoComplete="off"
              />
              {ingredientSearch && (
                <button
                  type="button"
                  onClick={() => setIngredientSearch('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select
              value={formData.ingredientId}
              onValueChange={(val) => setFormData({ ...formData, ingredientId: val })}
              disabled={loadingIngredients}
            >
              <SelectTrigger id="ingredient" aria-label="Selecionar insumo">
                <SelectValue
                  placeholder={
                    loadingIngredients
                      ? 'Carregando insumos...'
                      : 'Selecione um insumo...'
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {filteredIngredients.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">
                    {ingredients.length === 0
                      ? 'Nenhum insumo cadastrado'
                      : 'Nenhum insumo encontrado'}
                  </div>
                ) : (
                  filteredIngredients.map((ing) => (
                    <SelectItem key={ing.id} value={ing.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{ing.name}</span>
                        <span className="text-xs text-slate-500">
                          {ing.code ? `${ing.code}` : 'Sem código'}
                          {ing.category?.name ? ` • ${ing.category.name}` : ''}
                          {ing.standardUnit ? ` • ${ing.standardUnit}` : ''}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {selectedIngredient && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecionado: <span className="font-medium text-slate-700 dark:text-slate-200">{selectedIngredient.name}</span>
                {selectedIngredient.code ? ` (${selectedIngredient.code})` : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="movementType">Tipo de Movimentação</Label>
              <Select
                value={formData.movementType}
                onValueChange={(val) => setFormData({ ...formData, movementType: val })}
              >
                <SelectTrigger id="movementType" aria-label="Tipo de movimentação">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Motivo da movimentação (opcional)"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button type="submit" disabled={isLoading} loading={isLoading}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar Movimentação
            </Button>
            <Link href="/estoque">
              <Button type="button" variant="outline" className="w-full sm:w-auto">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
