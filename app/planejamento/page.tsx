'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { useI18n } from '@/lib/i18n';

export default function PlanejamentoPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const res = await fetch('/api/production-plans');
      if (!res.ok) throw new Error('Erro ao buscar planos');
      const data = await res.json();
      setPlans(data);
    } catch (error) {
      toast.error('Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" label={t('common.back')} />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">{t('planning.title')}</h1>
            <p className="text-slate-600">{t('planning.subtitle')}</p>
          </div>
        </div>
        <Link href="/planejamento/novo">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('planning.new')}
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height="h-28" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <Calendar className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600">Nenhum plano de produção cadastrado</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <Link key={plan.id} href={`/planejamento/${plan.id}`}>
              <Card className="cursor-pointer p-4 transition-all hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{formatDate(plan.planDate)}</h3>
                    <p className="text-sm text-slate-600">{plan.items?.length ?? 0} receitas</p>
                    <p className="text-xs text-slate-500 mt-1">Status: {plan.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">R$ {plan.totalCost?.toFixed(2)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}