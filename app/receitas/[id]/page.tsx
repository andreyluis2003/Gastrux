'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Edit2, Trash2, AlertCircle, Clock, Scale, Utensils, ChefHat, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { FadeIn } from '@/components/ui/animate';
import { GlassCard } from '@/components/ui/glass-card';
import { formatBRL } from '@/lib/formatters';

interface RecipeIngredient {
  id: string;
  quantity: number;
  unit: string;
  notes?: string;
  ingredient: {
    id: string;
    name: string;
    code: string;
    standardUnit: string;
    referenceCost: number;
    category?: {
      id: string;
      name: string;
      color: string;
    };
    currentStock?: {
      currentQuantity: number;
    };
  };
}

interface Recipe {
  id: string;
  code: string;
  name: string;
  description?: string;
  baseYield: number;
  yieldUnit: string;
  portionSize: number;
  portionUnit: string;
  prepTimeMinutes: number;
  yieldLossFactor: number;
  totalCost: number;
  costPerPortion: number;
  sellingPrice?: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
}

export default function ReceitaDetailPage() {
  const { data: session } = useSession() || {};
  const params = useParams();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showAddIngredientDialog, setShowAddIngredientDialog] = useState(false);
  const [availableIngredients, setAvailableIngredients] = useState<any[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<string>('');
  const [ingredientQuantity, setIngredientQuantity] = useState('1');
  const [ingredientUnit, setIngredientUnit] = useState('un');
  const [addingIngredient, setAddingIngredient] = useState(false);

  // Selling price / Food Cost
  const [editingPrice, setEditingPrice] = useState(false);
  const [sellingPriceInput, setSellingPriceInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const user = session?.user as any;
  const canEdit = user?.role !== 'COOK';
  const canDelete = user?.role === 'OWNER';

  useEffect(() => {
    fetchRecipe();
  }, [params.id]);

  async function fetchRecipe() {
    try {
      const res = await fetch(`/api/recipes/${params.id}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) throw new Error('Receita não encontrada');
      const data = await res.json();
      setRecipe(data);
    } catch (error) {
      toast.error('Erro ao carregar receita');
      router.push('/receitas');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSellingPrice() {
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/recipes/${params.id}/selling-price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellingPrice: sellingPriceInput ? parseFloat(sellingPriceInput) : null }),
      });
      if (!res.ok) throw new Error();
      await fetchRecipe();
      setEditingPrice(false);
      toast.success('Preço de venda atualizado');
    } catch {
      toast.error('Erro ao atualizar preço');
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja desativar esta receita?')) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${params.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao deletar');
      toast.success('Receita desativada com sucesso');
      router.push('/receitas');
    } catch (error) {
      toast.error('Erro ao desativar receita');
    } finally {
      setDeleting(false);
    }
  }

  async function handleOpenAddIngredientDialog() {
    try {
      const res = await fetch('/api/ingredients');
      if (!res.ok) throw new Error('Erro ao carregar ingredientes');
      const ingredients = await res.json();
      setAvailableIngredients(ingredients);
      setShowAddIngredientDialog(true);
    } catch (error) {
      toast.error('Erro ao carregar ingredientes');
    }
  }

  async function handleAddIngredient() {
    if (!selectedIngredient || !ingredientQuantity) {
      toast.error('Preencha todos os campos obrigatorios');
      return;
    }

    setAddingIngredient(true);
    try {
      const res = await fetch(`/api/recipes/${params.id}/ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: selectedIngredient,
          quantity: parseFloat(ingredientQuantity),
          unit: ingredientUnit,
        }),
      });

      if (!res.ok) throw new Error('Erro ao adicionar ingrediente');
      
      // Recarregar a receita
      await fetchRecipe();
      setShowAddIngredientDialog(false);
      setSelectedIngredient('');
      setIngredientQuantity('1');
      setIngredientUnit('un');
      toast.success('Ingrediente adicionado com sucesso');
    } catch (error) {
      toast.error('Erro ao adicionar ingrediente');
    } finally {
      setAddingIngredient(false);
    }
  }

  // Calculate cost from ingredients
  const calculatedCost = recipe?.ingredients?.reduce((total, ri) => {
    return total + (ri.quantity * ri.ingredient.referenceCost);
  }, 0) ?? 0;

  const displayTotalCost = recipe?.totalCost && recipe.totalCost > 0 ? recipe.totalCost : calculatedCost;
  const displayCostPerPortion = recipe?.costPerPortion && recipe.costPerPortion > 0
    ? recipe.costPerPortion
    : recipe?.portionSize ? displayTotalCost / (recipe.baseYield / recipe.portionSize) : 0;

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Receitas', href: '/receitas' },
          { label: 'Carregando...' }
        ]} />
        <div className="flex items-center gap-4">
          <BackButton href="/receitas" label="Voltar" />
          <h1 className="text-xl sm:text-3xl font-bold">Carregando...</h1>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Receitas', href: '/receitas' },
          { label: 'Não encontrada' }
        ]} />
        <div className="flex items-center gap-4">
          <BackButton href="/receitas" label="Voltar" />
        </div>
        <Card className="flex h-40 flex-col items-center justify-center">
          <AlertCircle className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600">Receita não encontrada</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[
        { label: 'Receitas', href: '/receitas' },
        { label: recipe.name }
      ]} />

      <FadeIn>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton href="/receitas" label="Voltar" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold truncate">{recipe.name}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Código: {recipe.code}</p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleOpenAddIngredientDialog}
                aria-label={`Adicionar ingrediente a receita ${recipe.name}`}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Adicionar Ingrediente
              </Button>
              <Link href={`/receitas/${params.id}/editar`}>
                <Button
                  variant="outline"
                  aria-label={`Editar receita ${recipe.name}`}
                >
                  <Edit2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Editar
                </Button>
              </Link>
              {canDelete && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label={`Desativar receita ${recipe.name}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {deleting ? 'Desativando...' : 'Desativar'}
                </Button>
              )}
            </div>
          )}
        </div>
      </FadeIn>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <FadeIn delay={0.1}>
          <GlassCard>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Rendimento</p>
                <p className="text-lg font-bold">{recipe.baseYield} {recipe.yieldUnit}</p>
              </div>
            </div>
          </GlassCard>
        </FadeIn>

        <FadeIn delay={0.15}>
          <GlassCard>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <Utensils className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Porção</p>
                <p className="text-lg font-bold">{recipe.portionSize} {recipe.portionUnit}</p>
              </div>
            </div>
          </GlassCard>
        </FadeIn>

        <FadeIn delay={0.2}>
          <GlassCard>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tempo de Preparo</p>
                <p className="text-lg font-bold">{recipe.prepTimeMinutes} min</p>
              </div>
            </div>
          </GlassCard>
        </FadeIn>

        <FadeIn delay={0.25}>
          <GlassCard>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                <ChefHat className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fator de Perda</p>
                <p className="text-lg font-bold">{recipe.yieldLossFactor}%</p>
              </div>
            </div>
          </GlassCard>
        </FadeIn>
      </div>

      {/* Cost Summary */}
      <FadeIn delay={0.3}>
        <Card className="border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-6">
          <h3 className="mb-4 text-lg font-semibold">Resumo de Custos</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Custo Total da Receita</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatBRL(displayTotalCost)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Custo por Porção</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatBRL(displayCostPerPortion)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Preço de Venda</p>
              {editingPrice ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    value={sellingPriceInput}
                    onChange={(e) => setSellingPriceInput(e.target.value)}
                    placeholder="0.00"
                    className="h-8 w-28"
                    step="0.01"
                    min="0"
                  />
                  <Button size="sm" className="h-8" onClick={handleSaveSellingPrice} disabled={savingPrice}>OK</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingPrice(false)}>✕</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {recipe.sellingPrice ? formatBRL(recipe.sellingPrice) : '—'}
                  </p>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSellingPriceInput(recipe.sellingPrice ? String(recipe.sellingPrice) : '');
                        setEditingPrice(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3 mr-1" /> Definir
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Food Cost %</p>
              {recipe.sellingPrice && recipe.sellingPrice > 0 ? (() => {
                const fc = (displayCostPerPortion / recipe.sellingPrice) * 100;
                const color = fc > 35 ? 'text-red-600' : fc > 28 ? 'text-amber-600' : 'text-emerald-600';
                const label = fc > 35 ? 'Alto' : fc > 28 ? 'Ideal' : 'Excelente';
                const suggestedPrice = displayCostPerPortion / 0.30; // Target 30% food cost
                return (
                  <div>
                    <p className={`text-2xl font-bold ${color}`}>{fc.toFixed(1)}%</p>
                    <p className={`text-xs ${color}`}>{label}</p>
                    {fc > 35 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Sugestão: {formatBRL(suggestedPrice)} (para 30%)
                      </p>
                    )}
                  </div>
                );
              })() : (
                <p className="text-2xl font-bold text-slate-400">—</p>
              )}
            </div>
          </div>
        </Card>
      </FadeIn>

      {/* Description */}
      {recipe.description && (
        <FadeIn delay={0.35}>
          <Card className="p-6">
            <h3 className="mb-3 font-semibold">Descrição / Modo de Preparo</h3>
            <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{recipe.description}</p>
          </Card>
        </FadeIn>
      )}

      {/* Ingredients Table */}
      <FadeIn delay={0.4}>
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold">Ingredientes ({recipe.ingredients?.length || 0})</h3>
          {recipe.ingredients && recipe.ingredients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-slate-700">
                    <th className="py-3 text-left font-semibold">Ingrediente</th>
                    <th className="py-3 text-left font-semibold">Categoria</th>
                    <th className="py-3 text-right font-semibold">Quantidade</th>
                    <th className="py-3 text-right font-semibold">Custo Unit.</th>
                    <th className="py-3 text-right font-semibold">Custo Total</th>
                    <th className="py-3 text-center font-semibold">Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.ingredients.map((ri) => {
                    const itemCost = ri.quantity * ri.ingredient.referenceCost;
                    const stockQty = ri.ingredient.currentStock?.currentQuantity ?? 0;
                    return (
                      <tr key={ri.id} className="border-b dark:border-slate-700 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="py-3">
                          <Link href={`/insumos/${ri.ingredient.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                            {ri.ingredient.name}
                          </Link>
                          <p className="text-xs text-slate-500">{ri.ingredient.code}</p>
                        </td>
                        <td className="py-3">
                          {ri.ingredient.category ? (
                            <Badge
                              style={{
                                backgroundColor: ri.ingredient.category.color,
                                color: 'white',
                              }}
                              className="text-xs"
                            >
                              {ri.ingredient.category.name}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 text-right font-medium">
                          {ri.quantity} {ri.unit}
                        </td>
                        <td className="py-3 text-right">
                          {formatBRL(ri.ingredient.referenceCost)}
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {formatBRL(itemCost)}
                        </td>
                        <td className="py-3 text-center">
                          <Badge variant={stockQty > 0 ? 'default' : 'destructive'}>
                            {stockQty} {ri.ingredient.standardUnit}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 dark:border-slate-600">
                    <td colSpan={4} className="py-3 text-right font-bold">Total:</td>
                    <td className="py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(calculatedCost)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Utensils className="mb-2 h-8 w-8" />
              <p>Nenhum ingrediente cadastrado nesta receita</p>
            </div>
          )}
        </Card>
      </FadeIn>

      {/* Add Ingredient Dialog */}
      <Dialog open={showAddIngredientDialog} onOpenChange={setShowAddIngredientDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Ingrediente</DialogTitle>
            <DialogDescription>
              Selecione um ingrediente para adicionar a esta receita
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Ingredient Selection */}
            <div className="space-y-2">
              <Label htmlFor="ingredient-select">Ingrediente *</Label>
              <Select value={selectedIngredient} onValueChange={setSelectedIngredient}>
                <SelectTrigger id="ingredient-select">
                  <SelectValue placeholder="Selecione um ingrediente..." />
                </SelectTrigger>
                <SelectContent>
                  {availableIngredients.map((ingredient) => (
                    <SelectItem key={ingredient.id} value={ingredient.id}>
                      {ingredient.name} ({ingredient.standardUnit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade *</Label>
              <Input
                id="quantity"
                type="number"
                placeholder="1"
                value={ingredientQuantity}
                onChange={(e) => setIngredientQuantity(e.target.value)}
                step="0.01"
                min="0.01"
              />
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <Label htmlFor="unit-select">Unidade</Label>
              <Select value={ingredientUnit} onValueChange={setIngredientUnit}>
                <SelectTrigger id="unit-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">Unidade</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="l">l</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAddIngredientDialog(false)}
                disabled={addingIngredient}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddIngredient}
                disabled={addingIngredient}
                loading={addingIngredient}
              >
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
