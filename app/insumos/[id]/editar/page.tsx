'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FadeIn } from '@/components/ui/animate';
import { BackButton } from '@/components/ui/back-button';

interface IngredientCategory {
  id: string;
  name: string;
  color: string;
}

interface Ingredient {
  id: string;
  name: string;
  code: string;
  description?: string;
  categoryId?: string;
  standardUnit: string;
  minimumStock: number;
  referenceCost: number;
}

export default function EditIngredientPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    categoryId: '',
    standardUnit: 'kg',
    minimumStock: 0,
    referenceCost: 0,
  });

  const user = session?.user as any;
  const canEdit = user?.role !== 'COOK';

  useEffect(() => {
    if (!canEdit) {
      toast.error('Sem permissão');
      router.push('/insumos');
      return;
    }
    fetchData();
  }, [params.id, canEdit]);

  async function fetchData() {
    try {
      const [ingredientRes, categoriesRes] = await Promise.all([
        fetch(`/api/ingredients/${params.id}`),
        fetch('/api/ingredients/categories').catch(() => new Response(JSON.stringify([]), { status: 200 })),
      ]);

      if (!ingredientRes.ok) throw new Error('Insumo não encontrado');
      
      const ing = await ingredientRes.json();
      setIngredient(ing);
      setFormData({
        name: ing.name,
        code: ing.code,
        description: ing.description || '',
        categoryId: ing.categoryId || '',
        standardUnit: ing.standardUnit,
        minimumStock: ing.minimumStock,
        referenceCost: ing.referenceCost,
      });

      try {
        const cats = await categoriesRes.json();
        if (Array.isArray(cats)) {
          setCategories(cats);
        }
      } catch (e) {
        // Categories fetch failed, continue without them
      }
    } catch (error) {
      toast.error('Erro ao carregar dados');
      router.push('/insumos');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/ingredients/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Erro ao salvar');
      toast.success('Insumo atualizado com sucesso');
      router.push(`/insumos/${params.id}`);
    } catch (error) {
      toast.error('Erro ao salvar insumo');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="flex items-center gap-4">
          <BackButton href="/insumos" label="Voltar" />
          <h1 className="text-xl sm:text-3xl font-bold">Carregando...</h1>
        </div>
      </div>
    );
  }

  if (!ingredient) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="flex items-center gap-4">
          <BackButton href="/insumos" label="Voltar" />
        </div>
        <Card className="flex h-40 flex-col items-center justify-center">
          <p className="text-slate-600">Insumo não encontrado</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <FadeIn>
        <div className="flex items-center gap-4">
          <BackButton href="/insumos" label="Voltar" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Editar Insumo</h1>
            <p className="text-slate-600 dark:text-slate-400">{ingredient.name}</p>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card className="max-w-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Arroz integral"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ex: ARR-001"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detalhes adicionais sobre o insumo"
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="categoryId">Categoria</Label>
                <select
                  id="categoryId"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="standardUnit">Unidade Padrão *</Label>
                <select
                  id="standardUnit"
                  value={formData.standardUnit}
                  onChange={(e) => setFormData({ ...formData, standardUnit: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  required
                >
                  <option value="kg">Quilograma (kg)</option>
                  <option value="g">Grama (g)</option>
                  <option value="l">Litro (l)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="un">Unidade (un)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="minimumStock">Estoque Mínimo *</Label>
                <Input
                  id="minimumStock"
                  type="number"
                  step="0.01"
                  value={formData.minimumStock}
                  onChange={(e) => setFormData({ ...formData, minimumStock: parseFloat(e.target.value) })}
                  placeholder="Ex: 10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referenceCost">Custo de Referência (R$) *</Label>
                <Input
                  id="referenceCost"
                  type="number"
                  step="0.01"
                  value={formData.referenceCost}
                  onChange={(e) => setFormData({ ...formData, referenceCost: parseFloat(e.target.value) })}
                  placeholder="Ex: 5.50"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </Card>
      </FadeIn>
    </div>
  );
}
