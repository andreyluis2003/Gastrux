'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';

export default function NovoPlanejamentoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [planDate, setPlanDate] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!planDate) {
      toast.error('Selecione uma data');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/production-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planDate: new Date(planDate),
          notes,
        }),
      });

      if (!res.ok) throw new Error('Erro ao criar plano');
      toast.success('Plano criado com sucesso');
      router.push('/planejamento');
    } catch (error) {
      toast.error('Erro ao criar plano');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/planejamento" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Novo Plano</h1>
          <p className="text-slate-600 dark:text-slate-400">Criar plano de produção</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="planDate">Data do Plano</Label>
            <Input
              id="planDate"
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionais sobre este plano"
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading} loading={isLoading}>
              <Calendar className="mr-2 h-4 w-4" />
              Criar Plano
            </Button>
            <Link href="/planejamento">
              <Button variant="outline">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
