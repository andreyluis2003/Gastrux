'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';

const UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'l', label: 'l' },
  { value: 'ml', label: 'ml' },
  { value: 'un', label: 'un' },
];

export default function NovoInsumoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    categoryId: '',
    standardUnit: 'kg',
    purchaseUnit: 'kg',
    minimumStock: 0,
    referenceCost: 0,
  });

  useEffect(() => {
    fetch('/api/ingredients/categories')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCategories(Array.isArray(data) ? data : data.categories || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.categoryId) {
      toast.error('Selecione uma categoria');
      return;
    }
    setIsLoading(true);

    try {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Erro ao criar insumo');
      }
      toast.success('Insumo criado com sucesso');
      router.push('/insumos');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar insumo');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/insumos" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Novo Insumo</h1>
          <p className="text-slate-600 dark:text-slate-400">Cadastrar novo ingrediente</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="INS001"
                required
              />
            </div>
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Frango Peito"
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
              placeholder="Detalhes adicionais"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Categoria</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(val) => setFormData({ ...formData, categoryId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade Padrão</Label>
              <Select
                value={formData.standardUnit}
                onValueChange={(val) => setFormData({ ...formData, standardUnit: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="minimumStock">Estoque Mínimo</Label>
              <Input
                id="minimumStock"
                type="number"
                step="0.01"
                value={formData.minimumStock}
                onChange={(e) => setFormData({ ...formData, minimumStock: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="referenceCost">Preço de Referência (R$)</Label>
              <Input
                id="referenceCost"
                type="number"
                step="0.01"
                value={formData.referenceCost}
                onChange={(e) => setFormData({ ...formData, referenceCost: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading} loading={isLoading}>
              Criar Insumo
            </Button>
            <Link href="/insumos">
              <Button variant="outline" type="button">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
