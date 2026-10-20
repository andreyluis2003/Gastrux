'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '@/components/ui/back-button';

interface Line {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  inStock: number | null;
  stockUnit: string;
  enough: boolean | null;
  missing: number | null;
  cost?: number;
}

interface Scaled {
  recipeName: string;
  portions: number;
  lines: Line[];
  totalCost?: number;
  missingCost?: string[];
}

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Escalonar receita (fixed 2026-10-19: it called /api/recipes/[id]/scale, which did not exist): the insumos of N
 * portions of a ficha técnica, what the stock has and what is missing. The cost shows only for owner and manager.
 */
export default function EscalonamentoPage() {
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [quantity, setQuantity] = useState('');
  const [recipes, setRecipes] = useState<any[]>([]);
  const [scaledData, setScaledData] = useState<Scaled | null>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error('Erro ao carregar receitas');
      const data = await res.json();
      // A ficha simples (a product with no insumos) has nothing to scale
      setRecipes((Array.isArray(data) ? data : []).filter((r) => r.ingredients?.length > 0).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      toast.error('Erro ao carregar receitas');
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function handleScale(e: React.FormEvent) {
    e.preventDefault();
    const portions = parseFloat(quantity.replace(',', '.'));
    if (!selectedRecipe || !(portions > 0)) {
      toast.error('Selecione uma ficha técnica e a quantidade de porções');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/recipes/${selectedRecipe}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: portions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao escalonar a receita');
      setScaledData(data);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao escalonar a receita');
    } finally {
      setBusy(false);
    }
  }

  const chosen = recipes.find((r) => r.id === selectedRecipe);
  const missingCount = scaledData?.lines.filter((l) => l.enough === false).length ?? 0;

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/dashboard" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Escalonar receita</h1>
          <p className="text-slate-600 dark:text-slate-400">Quanto separar de cada insumo para produzir uma quantidade</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleScale} className="space-y-4">
          <div>
            <Label htmlFor="recipe">Ficha técnica</Label>
            <Select value={selectedRecipe} onValueChange={(v) => { setSelectedRecipe(v); setScaledData(null); }}>
              <SelectTrigger id="recipe">
                <SelectValue placeholder={loadingRecipes ? 'Carregando fichas...' : recipes.length ? 'Selecione uma ficha técnica...' : 'Nenhuma ficha com insumos'} />
              </SelectTrigger>
              <SelectContent>
                {recipes.map((rec) => (
                  <SelectItem key={rec.id} value={rec.id}>
                    {rec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosen && (
              <p className="mt-1 text-xs text-muted-foreground">
                A ficha rende {num(Number(chosen.baseYield) || 1)} {chosen.yieldUnit || 'porção(ões)'}.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="quantity">Quantas porções?</Label>
            <Input
              id="quantity"
              inputMode="decimal"
              placeholder="Ex.: 30"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            <TrendingUp className="mr-2 h-4 w-4" />
            {busy ? 'Calculando...' : 'Escalonar'}
          </Button>
        </form>
      </Card>

      {scaledData && (
        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold">{scaledData.recipeName}: {num(scaledData.portions)} porções</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {missingCount > 0 ? `Falta estoque de ${missingCount} insumo${missingCount > 1 ? 's' : ''}.` : 'Separe estas quantidades.'}
          </p>
          <div className="space-y-3">
            {scaledData.lines.map((l) => (
              <div key={l.ingredientId} className="flex items-start justify-between gap-4 border-b pb-2">
                <div>
                  <p className="font-medium">{l.name}</p>
                  <p className={`text-sm ${l.enough === false ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}`}>
                    {l.inStock === null
                      ? 'Sem controle de estoque'
                      : l.enough
                        ? `No estoque: ${num(l.inStock)} ${l.stockUnit}`
                        : `No estoque: ${num(l.inStock)} ${l.stockUnit} · faltam ${num(l.missing ?? 0)} ${l.stockUnit}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{num(l.quantity)} {l.unit}</p>
                  {l.cost !== undefined && <p className="text-sm text-slate-600 dark:text-slate-400">{brl(l.cost)}</p>}
                </div>
              </div>
            ))}
            {scaledData.totalCost !== undefined && (
              <div className="border-t pt-4">
                <p className="text-lg font-bold">Custo total: {brl(scaledData.totalCost)}</p>
                {scaledData.missingCost && scaledData.missingCost.length > 0 && (
                  <p className="text-sm text-amber-700">Sem custo cadastrado: {scaledData.missingCost.join(', ')}. O custo real é maior.</p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
