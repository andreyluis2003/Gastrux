'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import {
  Settings,
  FileText,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

export default function NFePage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState<boolean>(false);
  const [envLabel, setEnvLabel] = useState<string>('');

  useEffect(() => {
    if (status !== 'authenticated') return;
    Promise.all([
      fetch('/api/nfe/stats').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/nfe/config').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([s, c]) => {
        setStats(s);
        setHasConfig(!!c);
        if (c?.environment === 'production') setEnvLabel('Produção');
        else if (c) setEnvLabel('Homologação');
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || loading) return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">NF-e / NFC-e</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Emissão e gerenciamento de notas fiscais eletrônicas
          </p>
        </div>
        {envLabel && (
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              envLabel === 'Produção' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
            }`}
          >
            Ambiente: {envLabel}
          </span>
        )}
      </div>

      {!hasConfig && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Configure a NFe para começar</p>
              <p>Você precisa cadastrar CNPJ e credenciais do provedor antes de emitir notas.</p>
              <Button
                onClick={() => router.push('/admin/nfe/config')}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                Configurar agora
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Autorizadas (hoje)</p>
              <p className="text-2xl font-bold text-green-700">
                {stats?.authorized?.today || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.authorized?.last7d || 0} nos últimos 7 dias
              </p>
            </div>
            <CheckCircle2 className="text-green-600" size={24} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Rejeitadas</p>
              <p className="text-2xl font-bold text-red-700">
                {stats?.byStatus?.rejected || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">total histórico</p>
            </div>
            <XCircle className="text-red-600" size={24} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold text-amber-700">
                {stats?.byStatus?.pending || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">aguardando processamento</p>
            </div>
            <Clock className="text-amber-600" size={24} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Faturamento do mês</p>
              <p className="text-2xl font-bold text-primary">
                {fmtBRL(stats?.revenue?.month || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                NFC-e autorizadas
              </p>
            </div>
            <DollarSign className="text-primary" size={24} />
          </div>
        </Card>
      </div>

      {/* Top rejected reasons */}
      {stats?.topRejectedReasons && stats.topRejectedReasons.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Principais motivos de rejeição</h3>
          <div className="space-y-2">
            {stats.topRejectedReasons.map((r: any, i: number) => (
              <div
                key={i}
                className="flex justify-between items-start text-sm border-b last:border-b-0 pb-2 last:pb-0"
              >
                <span className="text-muted-foreground flex-1 mr-2">{r.reason}</span>
                <span className="font-semibold text-red-700">{r.count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/admin/nfe/documents')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Documentos emitidos</h3>
              <FileText className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              Historico completo de NF-e e NFC-e com QR Code, DANFCe e ações.
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Abrir documentos <ArrowRight size={16} />
            </div>
          </div>
        </Card>

        <Card
          className="cursor-pointer transition-all hover:shadow-lg"
          onClick={() => router.push('/admin/nfe/config')}
        >
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Configuração</h3>
              <Settings className="text-primary" size={24} />
            </div>
            <p className="text-sm text-muted-foreground">
              CNPJ, IE, UF, credenciais do provedor (Focus NFe), séries e ambiente.
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              Configurar <ArrowRight size={16} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
