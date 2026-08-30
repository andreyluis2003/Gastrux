'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Filter } from 'lucide-react';
import { toast } from 'sonner';

interface Ingredient {
  id: string;
  name: string;
  code: string;
  category?: {
    name: string;
  };
}

interface ConsumptionFiltersProps {
  onFilterChange: (filters: {
    period: string;
    ingredientIds: string[];
    types: string[];
  }) => void;
}

export function ConsumptionFilters({
  onFilterChange,
}: ConsumptionFiltersProps) {
  const [period, setPeriod] = useState('30');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [searchIngredient, setSearchIngredient] = useState('');
  const [types, setTypes] = useState<string[]>(['MANUAL_DEDUCTION']);
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(true);

  useEffect(() => {
    const fetchIngredients = async () => {
      try {
        const response = await fetch('/api/ingredients');
        if (!response.ok) throw new Error('Failed to load ingredients');
        const data = await response.json();
        setIngredients(data);
      } catch (error) {
        toast.error('Erro ao carregar ingredientes');
      } finally {
        setIsLoadingIngredients(false);
      }
    };

    fetchIngredients();
  }, []);

  const handleFilterChange = () => {
    onFilterChange({
      period,
      ingredientIds: selectedIngredients,
      types,
    });
  };

  const toggleIngredient = (id: string) => {
    setSelectedIngredients((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filteredIngredients = ingredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(searchIngredient.toLowerCase()) ||
      ing.code.toLowerCase().includes(searchIngredient.toLowerCase())
  );

  return (
    <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-0">
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Filtros de Análise
        </h3>
      </div>

      <div className="grid gap-6">
        <div>
          <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            Período
          </Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 6 meses</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            Tipo de Movimentação
          </Label>
          <div className="space-y-2">
            {[
              { id: 'MANUAL_DEDUCTION', label: 'Saídas (Consumo)' },
              { id: 'ENTRY', label: 'Entradas' },
              { id: 'ADJUSTMENT', label: 'Ajustes' },
              { id: 'AUTO_DEDUCTION', label: 'Saídas Automáticas' },
            ].map((type) => (
              <label key={type.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={types.includes(type.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setTypes((prev) => [...prev, type.id]);
                    } else {
                      setTypes((prev) => prev.filter((t) => t !== type.id));
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {type.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            Ingredientes (opcional)
          </Label>
          <Input
            placeholder="Buscar por nome ou código..."
            value={searchIngredient}
            onChange={(e) => setSearchIngredient(e.target.value)}
            className="mb-3"
            disabled={isLoadingIngredients}
          />
          {isLoadingIngredients ? (
            <div className="text-sm text-slate-500">Carregando...</div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-700 rounded-md p-3 bg-white dark:bg-slate-950">
              {filteredIngredients.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-4">
                  Nenhum ingrediente encontrado
                </div>
              ) : (
                filteredIngredients.map((ing) => (
                  <label
                    key={ing.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIngredients.includes(ing.id)}
                      onChange={() => toggleIngredient(ing.id)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {ing.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {ing.code} • {ing.category?.name || 'Sem categoria'}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          )}
          {selectedIngredients.length > 0 && (
            <div className="text-xs text-slate-500 mt-2">
              {selectedIngredients.length} ingrediente(s) selecionado(s)
            </div>
          )}
        </div>

        <Button
          onClick={handleFilterChange}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          Aplicar Filtros
        </Button>
      </div>
    </Card>
  );
}
