'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import {
  BarChart3,
  TrendingUp,
  Zap,
  ArrowRight,
} from 'lucide-react';

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Relatórios Avançados</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Analise vendas, lucratividade e tendências de demanda
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/dashboard/reports/sales')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Vendas por Periodo</h3>
              <BarChart3 className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              Analise vendas por dia, semana, mes e categoria
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Ver Relatorio <ArrowRight size={16} />
            </div>
          </div>
        </Card>

        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/dashboard/reports/profitability')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Lucratividade</h3>
              <TrendingUp className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              Analise margem de lucro por prato e ingrediente
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Ver Relatorio <ArrowRight size={16} />
            </div>
          </div>
        </Card>

        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/dashboard/reports/demand')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Previsao de Demanda</h3>
              <Zap className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              Tendências e predições de venda baseado em histórico
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Ver Previsao <ArrowRight size={16} />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Dicas para Usar os Relatórios</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary font-bold">1.</span>
            <span>Use filtros de data para comparar periodos diferentes</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">2.</span>
            <span>Exporte relatórios em PDF ou Excel para compartilhar com sua equipe</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>Acompanhe as previsões de demanda para planejar melhor o cardápio</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">4.</span>
            <span>Identifique os pratos mais lucrativos e potencialize a venda deles</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}