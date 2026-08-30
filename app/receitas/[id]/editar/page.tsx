'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';

export default function EditarReceitaPage() {
  const router = useRouter();
  const params = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    baseYield: 1,
    yieldUnit: 'un',
    portionSize: 1,
    portionUnit: 'un',
    prepTimeMinutes: 0,
    yieldLossFactor: 0,
  });

  useEffect(() => {
    fetchRecipe();
  }, [params.id]);

  async function fetchRecipe() {
    try {
      const res = await fetch(`/api/recipes/${params.id}`);
      if (!res.ok) throw new Error('Receita não encontrada');
      const recipe = await res.json();
      setFormData({
        code: recipe.code,
        name: recipe.name,
        description: recipe.description || '',
        baseYield: recipe.baseYield,
        yieldUnit: recipe.yieldUnit,
        portionSize: recipe.portionSize,
        portionUnit: recipe.portionUnit,
        prepTimeMinutes: recipe.prepTimeMinutes,
        yieldLossFactor: recipe.yieldLossFactor,
      });
    } catch (error) {
      toast.error('Erro ao carregar receita');
      router.push('/receitas');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch(`/api/recipes/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Erro ao atualizar receita');
      toast.success('Receita atualizada com sucesso');
      router.push(`/receitas/${params.id}`);
    } catch (error) {
      toast.error('Erro ao atualizar receita');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
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
        <div className="h-40 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[
        { label: 'Receitas', href: '/receitas' },
        { label: formData.name || 'Editar' },
        { label: 'Editar' }
      ]} />
      <div className="flex items-center gap-4">
        <BackButton href={`/receitas/${params.id}`} label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Editar Receita</h1>
          <p className="text-slate-600 dark:text-slate-400">Atualizar ficha tecnica</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="code">Codigo</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="REC001"
                required
                disabled
              />
            </div>
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Frango Grelhado"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Modo de preparo e detalhes"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="baseYield">Rendimento Base</Label>
              <Input
                id="baseYield"
                type="number"
                step="0.01"
                value={formData.baseYield}
                onChange={(e) => setFormData({ ...formData, baseYield: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="yieldUnit">Unidade de Rendimento</Label>
              <Select
                value={formData.yieldUnit}
                onValueChange={(val) => setFormData({ ...formData, yieldUnit: val })}
              >
                <option value="un">un</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="portionSize">Tamanho da Porção</Label>
              <Input
                id="portionSize"
                type="number"
                step="0.01"
                value={formData.portionSize}
                onChange={(e) => setFormData({ ...formData, portionSize: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="yieldLossFactor">Fator de Perda (%)</Label>
              <Input
                id="yieldLossFactor"
                type="number"
                step="0.01"
                value={formData.yieldLossFactor}
                onChange={(e) => setFormData({ ...formData, yieldLossFactor: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="prepTime">Tempo de Preparo (minutos)</Label>
            <Input
              id="prepTime"
              type="number"
              value={formData.prepTimeMinutes}
              onChange={(e) => setFormData({ ...formData, prepTimeMinutes: parseInt(e.target.value) })}
            />
          </div>

          <div className="flex gap-4">
            <Button type="submit" disabled={isSaving} loading={isSaving}>
              Salvar Alterações
            </Button>
            <Link href={`/receitas/${params.id}`}>
              <Button variant="outline">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}