'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';

export default function NovaReceitaPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Erro ao criar receita');
      toast.success('Receita criada com sucesso');
      router.push('/receitas');
    } catch (error) {
      toast.error('Erro ao criar receita');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/receitas" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Nova Receita</h1>
          <p className="text-slate-600 dark:text-slate-400">Cadastrar nova ficha técnica</p>
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
                placeholder="REC001"
                required
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
            <Button type="submit" disabled={isLoading} loading={isLoading}>
              Criar Receita
            </Button>
            <Link href="/receitas">
              <Button variant="outline">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
