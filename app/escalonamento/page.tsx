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

export default function EscalonamentoPage() {
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [quantity, setQuantity] = useState('');
  const [recipes, setRecipes] = useState<any[]>([]);
  const [scaledData, setScaledData] = useState<any>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  useEffect(() => {
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error('Erro ao carregar receitas');
      const data = await res.json();
      setRecipes(data);
    } catch (error) {
      toast.error('Erro ao carregar receitas');
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function handleScale(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedRecipe || !quantity) {
      toast.error('Selecione uma receita e quantidade');
      return;
    }

    try {
      const res = await fetch(`/api/recipes/${selectedRecipe}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: parseFloat(quantity) }),
      });

      if (!res.ok) throw new Error('Erro ao escalar receita');
      const data = await res.json();
      setScaledData(data);
      toast.success('Receita escalada com sucesso');
    } catch (error) {
      toast.error('Erro ao escalar receita');
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/dashboard" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Escalonamento</h1>
          <p className="text-slate-600 dark:text-slate-400">Escalar receitas por quantidade</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleScale} className="space-y-4">
          <div>
            <Label htmlFor="recipe">Receita</Label>
            <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
              <SelectTrigger id="recipe">
                <SelectValue placeholder={loadingRecipes ? "Carregando receitas..." : "Selecione uma receita..."} />
              </SelectTrigger>
              <SelectContent>
                {recipes.map((rec) => (
                  <SelectItem key={rec.id} value={rec.id}>
                    {rec.name} ({rec.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="quantity">Quantidade</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              placeholder="Quantas porções/lotes?"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full">
            <TrendingUp className="mr-2 h-4 w-4" />
            Escalar Receita
          </Button>
        </form>
      </Card>

      {scaledData && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Resultado do Escalonamento</h2>
          <div className="space-y-4">
            {scaledData.ingredients?.map((ing: any) => (
              <div key={ing.ingredientId} className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">{ing.ingredientName}</p>
                  <p className="text-sm text-slate-600">Disponível: {ing.available ? 'Sim' : 'Não'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{ing.quantity} {ing.unit}</p>
                  <p className="text-sm text-slate-600">R$ {ing.cost?.toFixed(2)}</p>
                </div>
              </div>
            ))}
            <div className="border-t pt-4">
              <p className="text-lg font-bold">Custo Total: R$ {scaledData.totalCost?.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
