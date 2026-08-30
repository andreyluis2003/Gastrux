'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import {
  Box,
  GitBranch,
  ArrowRight,
} from 'lucide-react';

export default function AnvisaPage() {
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
            <h1 className="text-xl font-bold sm:text-3xl">Rastreabilidade ANVISA</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Controle e rastreamento de insumos conforme regulamentação ANVISA
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/admin/anvisa/batches')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Lotes de Insumos</h3>
              <Box className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              Gerencia de lotes, validades e rastreamento de quantidade
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Ver Lotes <ArrowRight size={16} />
            </div>
          </div>
        </Card>

        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/admin/anvisa/traces')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Rastreabilidade</h3>
              <GitBranch className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              Historico de movimentos e uso de insumos
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Ver Historico <ArrowRight size={16} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
